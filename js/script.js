// your script.js
const margin = { top: 40, right: 40, bottom: 40, left: 60 };
const width = 700;
const height = 700;

const svg = d3
  .select("#vis")
  .append("svg")
  .attr("width", width)
  .attr("height", height)
  .append("g")
  // we use a square canvas
  .attr("transform", `translate(${width / 2},${height / 2})`);

const svg2 = d3
  .select("#vis2")
  .append("svg")
  .attr("width", width)
  .attr("height", height)
  .append("g")
  // we use a square canvas
  .attr("transform", `translate(${width / 2},${height / 2})`);