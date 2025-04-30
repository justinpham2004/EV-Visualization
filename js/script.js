/********************************************************************
 *  GLOBAL STATE
 *******************************************************************/
let currentYear  = 2023;
let currentHour  = 0;                  // 0–23
let currentState = "Texas";

let counties;                          // { State : ["Adams", …] }
let data2023, data2024;                // CSV contents
let countyPaths = null;                // <path> selection on screen

/* clock -----------------------------------------------------------*/
let simulatedTime   = new Date(0);
const speedMultiplier = 1000;          // 10 ms real = 10 s sim
const updateInterval  = 10;            // 10 ms
let timer     = null;
let isRunning = false;

/********************************************************************
 *  HELPERS
 *******************************************************************/
const pad = n => n.toString().padStart(2,"0");
const normaliseCounty = s => s.toLowerCase().replace(/ county.*/, "").trim();

/********************************************************************
 *  LOAD CSVs  (add 'key')
 *******************************************************************/
async function loadData(){
  const [d23,d24] = await Promise.all([
      d3.csv("data/2023_Cleaned_Dataset.csv"),
      d3.csv("data/2024_Cleaned_Dataset.csv")
  ]);
  d23.forEach(d => d.key = normaliseCounty(d["Geography Name"]));
  d24.forEach(d => d.key = normaliseCounty(d["Geography Name"]));
  data2023 = d23;
  data2024 = d24;
}

/********************************************************************
 *  YEAR SLIDER  (2023 – 2035)
 *******************************************************************/
function setupSelector(){
  const slider = d3.sliderHorizontal()
      .min(2023).max(2035).step(1).width(500).displayValue(false)
      .on("onchange", v => { currentYear = v; updateVis(); });

  d3.select("#slider")
    .append("svg").attr("width",700).attr("height",100)
    .append("g").attr("transform","translate(30,30)")
    .call(slider);
}

/********************************************************************
 *  LEGEND  — build once, update per range
 *******************************************************************/
function buildLegend(){
  const legendW = 20, legendH = 150;

  const svg = d3.select("#legend").append("svg")
      .attr("id","legend-svg")
      .attr("width",90)
      .attr("height",legendH+40);

  svg.append("defs").append("linearGradient")
      .attr("id","legend-gradient")
      .attr("x1","0%").attr("y1","100%")
      .attr("x2","0%").attr("y2","0%");

  svg.append("rect")
      .attr("x",30).attr("y",10)
      .attr("width",legendW).attr("height",legendH)
      .attr("fill","url(#legend-gradient)");

  svg.append("g")
      .attr("id","legend-axis")
      .attr("transform",`translate(${30+legendW},10)`);
}

function updateLegend(minKw,maxKw){
  const legendH = 150;

  /* gradient stops with exponent γ = 2 */
  const lg = d3.select("#legend-gradient");
  lg.selectAll("stop").remove();
  d3.range(0,1.01,0.1).forEach(t=>{
      lg.append("stop")
        .attr("offset",(100*t)+"%")
        .attr("stop-color",
              d3.interpolateRgb("green","red")(Math.pow(t,2)));
  });

  const scale = d3.scaleLinear()
      .domain([minKw,maxKw]).nice()
      .range([legendH,0]);

  d3.select("#legend-axis")
    .call(d3.axisRight(scale).ticks(5).tickFormat(d3.format(".1f")));
}

/********************************************************************
 *  COLOUR UPDATE  (state × year × hour)
 *******************************************************************/
function updateVis(){
  if(!countyPaths) return;

  const base = currentYear===2023 ? data2023 : data2024;
  const hourRows = base.filter(r => +r["Hour of Day"] === currentHour);

  const wanted = counties[currentState].map(c=>c.toLowerCase());
  const rows   = hourRows.filter(r => wanted.includes(r.key));

  const minKw  = d3.min(rows, r=>+r["Avg. Demand (kW)"]);
  const maxKw  = d3.max(rows, r=>+r["Avg. Demand (kW)"]);
  const domain = minKw===maxKw ? [minKw-1, maxKw+1] : [minKw,maxKw];

  const colour = d3.scaleSequentialPow()
        .exponent(2)                              // γ = 2 (exponential)
        .domain(domain)
        .interpolator(d3.interpolateRgb("green","red"));

  countyPaths.transition().duration(200)
    .attr("fill", d=>{
        const row = rows.find(r=>r.key===normaliseCounty(d.properties.name));
        return row ? colour(+row["Avg. Demand (kW)"]) : "#cccccc";
    });

  updateLegend(minKw,maxKw);
}

/********************************************************************
 *  DRAW MAP + TOOL-TIPS
 *******************************************************************/
function createVis(us){
  const stateTopo  = topojson.feature(us,us.objects.states);
  const countyTopo = topojson.feature(us,us.objects.counties);
  const path = d3.geoPath();
  const w=1000, h=700;

  const svg = d3.select("#vis").append("svg")
        .attr("viewBox",[0,0,w+50,h+50])
        .attr("width",w).attr("height",h)
        .style("max-width","100%");

  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([1,8]).on("zoom",e=>{
      g.attr("transform",e.transform).attr("stroke-width",1/e.transform.k);
  }));

  /* STATES --------------------------------------------------------*/
  g.append("g").attr("cursor","pointer")
    .selectAll("path").data(stateTopo.features).enter().append("path")
      .attr("d",path).attr("fill","#808080")
      .on("mouseover",(e,d)=>{
          d3.select("#tooltip").style("display","block")
            .html(`<strong>${d.properties.name}</strong>`);
          d3.select(e.currentTarget).attr("stroke","#000").attr("stroke-width",3).raise();
      })
      .on("mousemove",e=>{
          d3.select("#tooltip")
            .style("left",(e.pageX+20)+"px")
            .style("top",(e.pageY-28)+"px");
      })
      .on("mouseout",e=>{
          d3.select("#tooltip").style("display","none");
          d3.select(e.currentTarget).attr("stroke-width",0);
      })
      .on("click",clicked);

  g.append("path")
    .attr("fill","none").attr("stroke","#fff")
    .attr("d",path(topojson.mesh(us,us.objects.states,(a,b)=>a!==b)));

  /* STATE CLICK---------------------------------------------------*/
  function clicked(event,d){
    currentState = d.properties.name;
    const stId = d.id.slice(0,2);
    const stCounties = countyTopo.features.filter(c=>c.id.slice(0,2)===stId);

    countyPaths = g.selectAll(".county")
      .data(stCounties, c=>c.properties.name)
      .join("path")
        .attr("class","county")
        .attr("d",path)
        .attr("stroke","#fff").attr("stroke-width",1)
        .attr("fill","#999")
        .on("mouseover",(e,c)=>{
            const now  = (currentYear===2023?data2023:data2024)
                         .filter(r=>+r["Hour of Day"]===currentHour);
            const row  = now.find(r=>r.key===normaliseCounty(c.properties.name));
            const kw   = row ? (+row["Avg. Demand (kW)"]).toFixed(2) : "no data";
            d3.select("#tooltip2").style("display","block")
              .html(`<strong>${c.properties.name}</strong><br>Hour ${currentHour}: Avg kW ${kw}`);
            d3.select(e.currentTarget).attr("stroke","#000").attr("stroke-width",2).raise();
            document.getElementById("current-county-info").innerHTML =
              `<strong>${c.properties.name}</strong><br>Hour ${currentHour}: Avg kW ${kw}`;
        })
        .on("mousemove",e=>{
            d3.select("#tooltip2")
              .style("left",(e.pageX+20)+"px")
              .style("top",(e.pageY-28)+"px");
        })
        .on("mouseout",e=>{
            d3.select("#tooltip2").style("display","none");
            d3.select(e.currentTarget).attr("stroke","#fff").attr("stroke-width",1);
        });

    updateVis();
  }
}

/********************************************************************
 *  CLOCK & BUTTONS
 *******************************************************************/
function updateClockDisplay(){
  const s=Math.floor(simulatedTime.getTime()/1000);
  document.getElementById("clock").textContent =
    `${pad(Math.floor(s/3600))}:${pad(Math.floor((s%3600)/60))}:${pad(s%60)}`;
}

function start_clock(){
  if(isRunning) return;
  isRunning=true;
  timer=setInterval(()=>{
      simulatedTime = new Date(simulatedTime.getTime()+updateInterval*speedMultiplier);
      currentHour = simulatedTime.getUTCHours();
      updateClockDisplay();
      updateVis();
  },updateInterval);
}
function pause_simulation(){ if(isRunning){ clearInterval(timer); isRunning=false; } }
function reset_simulation(){ pause_simulation(); simulatedTime=new Date(0); currentHour=0; updateClockDisplay(); updateVis(); }
function play_simulation (){ if(!isRunning) start_clock(); }
function start_simulation(){ start_clock(); }

/********************************************************************
 *  BOOTSTRAP
 *******************************************************************/
async function init(){
  try{
    await loadData();
    counties = await d3.json("data/counties-by-state.json");
    for(const s in counties) counties[s]=counties[s].map(c=>c.replace(/ County$/,""));

    const us=await d3.json("data/counties-albers-10m.json");
    createVis(us);
    setupSelector();
    buildLegend();
    updateLegend(0,100);          // initial placeholder
    updateClockDisplay();
  }catch(err){ console.error(err);}
}
window.addEventListener("load",init);
