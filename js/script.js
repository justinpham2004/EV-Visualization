/* State Abbreviations */
const stateAbbrToName = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia",
  HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa",
  KS:"Kansas", KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland",
  MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi",
  MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire",
  NJ:"New Jersey", NM:"New Mexico", NY:"New York", NC:"North Carolina",
  ND:"North Dakota", OH:"Ohio", OK:"Oklahoma", OR:"Oregon", PA:"Pennsylvania",
  RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota", TN:"Tennessee",
  TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia", WA:"Washington",
  WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming", DC:"District of Columbia"
};
const nameToAbbr = Object.fromEntries(
  Object.entries(stateAbbrToName).map(([abbr, name]) => [name, abbr])
);

/* Global Variables */
let currentYear  = 2023;
let currentHour  = 0;
let currentState = "Texas";

let counties;                   
let data2023, data2024;        
let statePaths  = null;         
let countyPaths = null;         

/* simulated clock */
let simulatedTime = new Date(0);
const speedMultiplier = 1440;   // 10 ms real = 10 s sim
const updateInterval  = 10;
let timer = null; 
let isRunning = false;

/* Helpers */
const pad  = n => n.toString().padStart(2,"0");
const norm = s => s.toLowerCase().replace(/ county.*/, "").trim();

/* Loading datasets (including new 2023 merged dataset */
async function loadData(){
  const [d23, d24] = await Promise.all([
    d3.csv("data/merged_2023_county.csv"),   // new file
    d3.csv("data/2024_Cleaned_Dataset.csv")  // original 2024
  ]);

  /* normalise 2023 rows */
  d23.forEach(r => {
    r.key   = norm(r["County"]);             // county key
    r.state = null;                          
    r["Hour of Day"]      = +r["Hour of Day"];
    r["Avg. Demand (kW)"] = +r["Avg. Demand"];
  });

  /* normalise 2024 rows (old format) */
  d24.forEach(r => {
    r.key = norm(r["Geography Name"]);
    const parts = r["Geography Name"].split(", ");
    r.state = parts.length > 1 ? parts[1].toUpperCase() : null;
    r["Hour of Day"] = +r["Hour of Day"];
    r["Avg. Demand (kW)"] = +r["Avg. Demand (kW)"];
  });

  data2023 = d23;
  data2024 = d24;
}

/* Year Slider */
function setupSelector(){
  const slider = d3.sliderHorizontal()
      .min(2023).max(2035).step(1)
      .tickFormat(d3.format("d"))
      .width(500).displayValue(false)
      .on("onchange", v => { currentYear = v; updateVis(); });


  d3.select("#slider")
    .append("svg").attr("width",700).attr("height",100)
    .append("g").attr("transform","translate(30,30)")
    .call(slider);
}

/* Legend */
function buildLegend(){
  const H=150, W=20;
  const svg = d3.select("#legend").append("svg")
      .attr("width",90).attr("height",H+40);

  svg.append("defs").append("linearGradient")
      .attr("id","legend-gradient")
      .attr("x1","0%").attr("y1","100%")
      .attr("x2","0%").attr("y2","0%");

  svg.append("rect")
      .attr("x",30).attr("y",10).attr("width",W).attr("height",H)
      .attr("fill","url(#legend-gradient)");

  svg.append("g")
      .attr("id","legend-axis")
      .attr("transform",`translate(${30+W},10)`);
}

function updateLegend(minKw, maxKw, colourFn){
  const H=150, nStops=20;
  d3.select("#legend-gradient").selectAll("stop")
    .data(d3.range(0,nStops+1))
    .join("stop")
      .attr("offset",d=> (d/nStops)*100 + "%")
      .attr("stop-color",d=>{
          const t = d/nStops;
          return colourFn(minKw + t*(maxKw-minKw));
      });

  const scale = d3.scaleLinear().domain([minKw,maxKw]).nice().range([H,0]);
  d3.select("#legend-axis")
    .call(d3.axisRight(scale).ticks(5).tickFormat(d3.format(".1f")));
}

/* Upadting visualization with timer */
function updateVis(){
  if(!statePaths) return;

  const base     = currentYear===2023 ? data2023 : data2024;
  const hourRows = base.filter(r => r["Hour of Day"] === currentHour);

  /* attach state codes to 2023 rows (once) */
  if(currentYear===2023 && hourRows.length && hourRows[0].state===null){
    for(const row of data2023){
      for(const [name, list] of Object.entries(counties)){
        if(list.map(norm).includes(row.key)){
          row.state = nameToAbbr[name];   // e.g. "TX"
          break;
        }
      }
    }
  }

  /* ---- state totals ---- */
  const stateTotals = d3.rollup(
      hourRows,
      v => d3.sum(v, d => d["Avg. Demand (kW)"]),
      r => stateAbbrToName[r.state]          // full name of state
  );
  const maxStateKw = d3.max(stateTotals.values());

  const stateColour = d3.scaleSequentialPow()
      .exponent(2)
      .domain([0,maxStateKw])
      .interpolator(d3.interpolateRgb("blue","yellow"));

  statePaths.transition().duration(200)
    .attr("fill", d=>{
      const tot = stateTotals.get(d.properties.name);
      return tot ? stateColour(tot) : "#808080";
    });

  /* show legend for states when no county layer */
  if(!countyPaths) updateLegend(0, maxStateKw, stateColour);

  /* ---- counties (if a state is open) ---- */
  if(countyPaths){
    const wanted = counties[currentState].map(c=>c.toLowerCase());
    const rows   = hourRows.filter(r=>wanted.includes(r.key));

    const minKw = d3.min(rows,r=>r["Avg. Demand (kW)"]);
    const maxKw = d3.max(rows,r=>r["Avg. Demand (kW)"]);
    const domain = minKw===maxKw ? [minKw-1,maxKw+1] : [minKw,maxKw];

    const countyColour = d3.scaleSequentialPow()
        .exponent(2).domain(domain)
        .interpolator(d3.interpolateRgb("blue","yellow"));

    countyPaths.transition().duration(200)
      .attr("fill", d=>{
        const row = rows.find(r=>r.key===norm(d.properties.name));
        return row ? countyColour(row["Avg. Demand (kW)"]) : "#cccccc";
      });

    /* legend switches to county scale */
    updateLegend(minKw, maxKw, countyColour);
  }
}

/* Drawing map and Tool Tip */
function createVis(us){
  const stateTopo  = topojson.feature(us, us.objects.states);
  const countyTopo = topojson.feature(us, us.objects.counties);
  const path = d3.geoPath();
  const w=1000, h=700;

  const svg = d3.select("#vis").append("svg")
      .attr("viewBox",[0,0,w+50,h+50]).attr("width",w).attr("height",h)
      .style("max-width","100%");

  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([1,8]).on("zoom",e=>{
      g.attr("transform",e.transform).attr("stroke-width",1/e.transform.k);
  }));

  /* States */
  statePaths = g.append("g").attr("cursor","pointer")
    .selectAll("path").data(stateTopo.features).enter().append("path")
      .attr("d",path).attr("fill","#808080")
      .on("mouseover",(e,d)=>{
          d3.select("#tooltip").style("display","block")
            .html(`<strong>${d.properties.name}</strong>`);
          d3.select(e.currentTarget).attr("stroke","#000").attr("stroke-width",3).raise();
      })
      .on("mousemove",e=>{
          d3.select("#tooltip").style("left",(e.pageX+20)+"px")
                               .style("top",(e.pageY-28)+"px");
      })
      .on("mouseout",e=>{
          d3.select("#tooltip").style("display","none");
          d3.select(e.currentTarget).attr("stroke-width",0);
      })
      .on("click", clicked);

  /* Borders */
  g.append("path")
    .attr("fill","none").attr("stroke","#fff")
    .attr("d",path(topojson.mesh(us,us.objects.states,(a,b)=>a!==b)));

  /* Once you click on states -> counties */
  function clicked(event, d){
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
            const dataset = (currentYear===2023?data2023:data2024)
                            .filter(r=>r["Hour of Day"]===currentHour);
            const row = dataset.find(r=>r.key===norm(c.properties.name));
            const kw  = row ? row["Avg. Demand (kW)"].toFixed(2) : "no data";
            d3.select("#tooltip2").style("display","block")
              .html(`<strong>${c.properties.name}</strong><br>Hour ${currentHour}: Avg kW ${kw}`);
            d3.select(e.currentTarget).attr("stroke","#000").attr("stroke-width",2).raise();
            document.getElementById("current-county-info").innerHTML =
              `<strong>${c.properties.name}</strong><br>Hour ${currentHour}: Avg kW ${kw}`;
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

/* Clock + Button Changes */
function updateClockDisplay(){
  const s=Math.floor(simulatedTime.getTime()/1000);
  document.getElementById("clock").textContent =
    `${pad(Math.floor(s/3600))}:${pad(Math.floor((s%3600)/60))}:${pad(s%60)}`;
}
function start_clock() {
  if (isRunning) return;
  isRunning = true;

  let prevHour = simulatedTime.getUTCHours();

  timer = setInterval(() => {
    // advance simulated clock by 14.4 s every real 10 ms
    simulatedTime = new Date(simulatedTime.getTime()
                             + updateInterval * speedMultiplier);

    const newHour = simulatedTime.getUTCHours();
    currentHour   = newHour;

    updateClockDisplay();

    // recolour the map only when the hour flips
    if (newHour !== prevHour) {
      prevHour = newHour;
      updateVis();
    }
  }, updateInterval);
}


function pause_simulation(){ if(isRunning){ clearInterval(timer); isRunning=false; } }
function reset_simulation(){ pause_simulation(); simulatedTime=new Date(0); currentHour=0; updateClockDisplay(); updateVis(); }
function play_simulation (){ if(!isRunning) start_clock(); }
function start_simulation(){ start_clock(); }

/* Bootstrap */
async function init(){
  try{
    await loadData();

    counties = await d3.json("data/counties-by-state.json");
    for(const s in counties)
      counties[s] = counties[s].map(c=>c.replace(/ County$/,""));

    const us = await d3.json("data/counties-albers-10m.json");
    createVis(us);
    setupSelector();
    buildLegend();
    updateVis();
    updateClockDisplay();
  }catch(err){ console.error(err);}
}
window.addEventListener("load", init);
