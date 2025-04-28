
let currentYear = 2023;
let currentTime = 0;
let currentState = 'Texas';

let simulatedTime = new Date(0); // Start at 00:00:00
const speedMultiplier = 1000;
const updateInterval = 10; // 10ms real time
let timer = null;
let isRunning = false;
let counties;


function setupSelector() {
  var slider = d3
  .sliderHorizontal()
  .min(2023)
  .max(2035)
  .step(1)
  .width(500)
  .displayValue(false)
  .on("onchange", function (val) {
    console.log(val);
    currentYear = val
  });

  d3.select('#slider')
    .append('svg')
    .attr('width', 70000)
    .attr('height', 100)
    .append('g')
    .attr('transform', 'translate(30,30)')
    .call(slider);
    

    //updateVis();
}

function updateVis() {
  // Current Year is loaded
  let file_name = `data/${currentYear}_gov_fleet_EV_load_profiles.csv`

  let all_data = d3.csv(file_name).then( data => {
    console.log(currentState,counties[currentState])
    let filtered = data.filter(d => counties[currentState].includes(d['Geography Name']));
    console.log(filtered);
    
  })


}

function createVis(us) {
  //Build Vis
  let states_topo = topojson.feature(us, us.objects.states);
  let counties_topo = topojson.feature(us, us.objects.counties);
  console.log(states_topo);

  const width = 1000;
  const height = 700;
  const svg = d3.select("#vis").append("svg")
  .attr("viewBox", [0, 0, width + 50, height + 50])
  .attr("width", width)
 .attr("height", height)
 .attr("style", "max-width: 100%; height: auto;")
 .on("click", function(event) {
  if (event.target.tagName === 'svg') {
    svg.transition().duration(750).call(
      zoom.transform,
      d3.zoomIdentity
    );
    g.selectAll(".county").remove();
  }
});

  
  const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on("zoom", zoomed);


  const path = d3.geoPath();

  const g = svg.append("g");


  const states = g.append("g")
    .attr("cursor", "pointer")
    .selectAll("path")
    .data(topojson.feature(us, us.objects.states).features)
    .join("path")
    .on("click", clicked)
    .on('mouseover', function (event, d) {
      console.log(d) // See the data point in the console for debugging
      d3.select('#tooltip')
      .style("display", 'block') // Make the tooltip visible
      .html( // Change the html content of the <div> directly
      `<strong>${d.properties.name}</strong><br/>`)
      .style("left", (event.pageX + 20) + "px")
      .style("top", (event.pageY - 28) + "px");
      // placeholder: show it and fill it with our data value
      d3.select(this) // Refers to the hovered circle
          .style('stroke', 'black')
          .style('stroke-width', '4px')
      
  })
  .on("mouseout", function (event, d) {
      d3.select('#tooltip')
          .style('display', 'none') // Hide tooltip when cursor leaves
      d3.select(this) // Refers to the hovered circle
          .style('stroke-width', '0px')
      //placeholder: hide it
  }) 
  .transition(.5)
    .attr("d", path)
    .attr("fill", '#808080');
  
  //states.append("title")
      //.text(d => d.properties.state_info.name);

  g.append("path")
      .attr("fill", "none")
      .attr("stroke", "white")
      .attr("stroke-linejoin", "round")
      .attr("d", path(topojson.mesh(us, us.objects.states, (a, b) => a !== b)));

  svg.call(zoom);

  
  

  function clicked(event, d) {
    currentState = d.properties.name;
    const [[x0, y0], [x1, y1]] = path.bounds(d);
    event.stopPropagation();
    svg.transition().duration(750).call(
      zoom.transform,
      d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)))
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
      d3.pointer(event, svg.node())
    );
    console.log("here")
    const stateId = d.id;
    const stateCounties = counties_topo.features.filter(c => c.id.slice(0,2) === stateId)

  g.selectAll(".county").remove();

  // Draw counties
  g.selectAll(".county")
    .data(stateCounties)
    .enter().append("path")
    .attr("class", "county")
    .attr("d", path)
    .attr("fill", "#999")
    .attr("stroke", "#fff")
    .on('mouseover', function (event, d) {
      console.log(d) // See the data point in the console for debugging
      d3.select('#tooltip2')
      .style("display", 'block') // Make the tooltip visible
      .html( // Change the html content of the <div> directly
      `<strong>${d.properties.name}</strong><br/>`)
      .style("left", (event.pageX + 20) + "px")
      .style("top", (event.pageY - 28) + "px");
      // placeholder: show it and fill it with our data value
      d3.select(this) // Refers to the hovered circle
          .style('stroke', 'black')
          .style('stroke-width', '2px')
  })
  .on("mouseout", function (event, d) {
      d3.select('#tooltip2')
          .style('display', 'none') // Hide tooltip when cursor leaves
      d3.select(this) // Refers to the hovered circle
          .style('stroke-width', '0px')
      //placeholder: hide it
  }) ;

  }

  function zoomed(event) {
    const {transform} = event;
    g.attr("transform", transform);
    g.attr("stroke-width", 1 / transform.k);
  }

  return svg.node();

}


function updateClockDisplay() {
  // Increment the simulated time
  const totalSeconds = Math.floor(simulatedTime.getTime() / 1000);
  const hours = pad(Math.floor(totalSeconds / 3600));
  const minutes = pad(Math.floor((totalSeconds % 3600) / 60));
  const seconds = pad(totalSeconds % 60);
  document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds}`;

}

function pad(number) {
  return number.toString().padStart(2, '0');
}
// Function to update the clock display
function start_clock() {
  console.log("starting simulation")
  //eventually have a speed selector?
  if (isRunning) return;
  isRunning = true;
  timer = setInterval(() => {
    simulatedTime = new Date(simulatedTime.getTime() + updateInterval * speedMultiplier);
    updateClockDisplay();
  }, updateInterval);
}

function start_simulation() { //fix where clicked twice
    start_clock()
    updateVis()
}

function pause_simulation() {
  if (!isRunning) return;
  clearInterval(timer);
  isRunning = false;
}

function play_simulation() {
  if (isRunning) return;
  start_simulation();
}

function reset_simulation() {
  pause_simulation();
  simulatedTime = new Date(0);
  updateClockDisplay();
}

async function init() {
  try {
    let us = await d3.json('./data/counties-albers-10m.json');
    counties = await d3.json('./data/counties-by-state.json').then(d => {
      let cleaned = {}

      for (let state in d) {
        cleaned[state] = d[state].map(county => {
          return county.endsWith(' County') 
          ? county.slice(0, -7) // remove ' county' from end
          : county;
        })
      }

      return cleaned
    })
    //let us2 = await d3.json('./data/counties-albers-10m.json');
    
     console.log('Map data:', us);
     console.log(counties)     
    // Add data to sets


     createVis(us);
  } catch(error) {
    console.log(error)
  }


}

window.addEventListener('load', init);
console.log(currentYear)
setupSelector();