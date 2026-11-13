const DATA_PATH = "data/gender.csv";
const FEMALE_COL = "average_value_Life expectancy at birth, female (years)";
const MALE_COL = "average_value_Life expectancy at birth, male (years)";
const START_YEAR = 1960;
const END_YEAR = 2019;
const SEX_LABEL = { female: "Women", male: "Men" };
const t = 400;          // transition duration (ms)
const PLAY_STEP = 500;  // ms per year when playing

const REGIONS = [
  { code: "NAC", label: "N. America",       name: "North America" },
  { code: "LCN", label: "Lat. America",     name: "Latin America & Caribbean" },
  { code: "ECS", label: "Europe & C. Asia", name: "Europe & Central Asia" },
  { code: "MEA", label: "MENA",             name: "Middle East & North Africa" },
  { code: "SSF", label: "Sub-Saharan",      name: "Sub-Saharan Africa" },
  { code: "SAS", label: "South Asia",       name: "South Asia" },
  { code: "EAS", label: "East Asia",        name: "East Asia & Pacific" },
];
const regionByCode = new Map(REGIONS.map((r) => [r.code, r]));

const W = 640, H = 440;
const margin = { top: 20, right: 16, bottom: 52, left: 56 };
const width = W - margin.left - margin.right;
const height = H - margin.top - margin.bottom;

function makeSvg(selector) {
  return d3.select(selector).append("svg")
    .attr("class", "chart-svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
}

let DATA;
let BLACK_HAT_CODES;
let targetYear = END_YEAR;
let sortKey = "region";

// data transformations
function parseRow(d) {
  const region = regionByCode.get(d["Country Code"]);
  if (!region) return null;
  const female = d[FEMALE_COL] === "" ? NaN : +d[FEMALE_COL];
  const male = d[MALE_COL] === "" ? NaN : +d[MALE_COL];
  const year = +d["Year"];
  if (isNaN(female) || isNaN(male) || year < START_YEAR || year > END_YEAR) return null;
  return { code: region.code, region: region.label, regionName: region.name, year, female, male };
}

function addDerived(rows) {
  rows.forEach((r) => {
    r.gap = r.female - r.male;
    r.gapPct = (r.gap / r.female) * 100;
    r.avgLE = (r.female + r.male) / 2;
  });
  const baseline = new Map(rows.filter((r) => r.year === START_YEAR).map((r) => [r.code, r.gap]));
  rows.forEach((r) => {
    const g0 = baseline.get(r.code);
    r.gapChange = r.gap - g0;
    r.gapPctChange = g0 > 0 ? (r.gap / g0 - 1) * 100 : null;
  });
  d3.group(rows, (r) => r.year).forEach((yr) => {
    yr.slice().sort((a, b) => d3.descending(a.gap, b.gap)).forEach((r, i) => (r.gapRank = i + 1));
  });
  return rows;
}

function buildLookups(rows) {
  return {
    rows,
    byYear: d3.group(rows, (r) => r.year),
    byRegion: d3.group(rows, (r) => r.code),
  };
}

const sorters = {
  region: (a, b) => REGIONS.findIndex((r) => r.code === a.code) - REGIONS.findIndex((r) => r.code === b.code),
  gap: (a, b) => d3.descending(a.gap, b.gap),
  lifeExpectancy: (a, b) => d3.descending(a.avgLE, b.avgLE),
};

function whiteHatData(data, year, key = "region") {
  return data.byYear.get(year).slice().sort(sorters[key]);
}

const WIDENING_THRESHOLD = 1;
function blackHatRegions(data) {
  return REGIONS.filter((reg) => {
    const s = data.byRegion.get(reg.code);
    const first = s.find((r) => r.year === START_YEAR);
    const last = s.find((r) => r.year === END_YEAR);
    return last.gap - first.gap >= WIDENING_THRESHOLD;
  }).map((r) => r.code);
}

function blackHatData(data, year, keepCodes) {
  const rows = data.byYear.get(year)
    .filter((r) => keepCodes.includes(r.code))
    .sort(sorters.region);
  const yMin = Math.floor((d3.min(rows, (r) => r.male) - 5) / 5) * 5;
  const yMax = Math.ceil(d3.max(rows, (r) => r.female) / 5) * 5;
  return { rows, yMin, yMax };
}

function headlineStat(rows) {
  const valid = rows.filter((r) => r.gapPctChange !== null);
  return valid.length ? d3.greatest(valid, (r) => r.gapPctChange) : null;
}

// helper funcs
const fmtGap = (g) => (g > 0 ? "+" : g < 0 ? "\u2212" : "") + Math.abs(g).toFixed(1);

function showTip(event, html) {
  d3.select("#tooltip")
    .style("display", "block")
    .html(html)
    .style("left", event.pageX + 15 + "px")
    .style("top", event.pageY - 28 + "px");
}
function hideTip() {
  d3.select("#tooltip").style("display", "none");
}

function wrapTicks(g) {
  g.selectAll(".tick text").each(function (d) {
    const text = d3.select(this);
    const words = String(d).split(" ");
    const first = words.shift();
    text.text(null).attr("dy", null);
    text.append("tspan").attr("x", 0).attr("dy", "0.71em").text(first);
    if (words.length) text.append("tspan").attr("x", 0).attr("dy", "1.1em").text(words.join(" "));
  });
}

function addYAxisTitle(g, text) {
  g.append("text").attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2).attr("y", -margin.left + 14)
    .style("text-anchor", "middle").text(text);
}

// white hat visualization
const svgW = makeSvg("#vis");
const xW = d3.scaleBand().range([0, width]).padding(0.2);
const xWSub = d3.scaleBand().domain(["female", "male"]).padding(0.05);
const yW = d3.scaleLinear().domain([0, 90]).range([height, 0]); // full zero baseline

svgW.append("g").attr("class", "y-grid").call(d3.axisLeft(yW).tickSize(-width).tickFormat(""));
svgW.append("g").attr("class", "y-axis").call(d3.axisLeft(yW).tickPadding(7));
const xAxisW = svgW.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
addYAxisTitle(svgW, "Life expectancy at birth (years)");

function updateWhite() {
  const rows = whiteHatData(DATA, targetYear, sortKey);
  xW.domain(rows.map((r) => r.region));
  xWSub.range([0, xW.bandwidth()]);
  xAxisW.call(d3.axisBottom(xW)); wrapTicks(xAxisW);

  const bars = rows.flatMap((r) =>
    ["female", "male"].map((sex) => ({ key: r.code + sex, sex, value: r[sex], row: r }))
  );
  const barX = (d) => xW(d.row.region) + xWSub(d.sex);

  svgW.selectAll(".bar")
    .data(bars, (d) => d.key)
    .join((enter) =>
      enter.append("rect")
        .attr("class", (d) => `bar bar-${d.sex}`)
        .attr("rx", 3)
        .attr("x", barX).attr("y", height).attr("height", 0)
        .attr("width", xWSub.bandwidth())
    )
    .on("mouseover", (event, d) => {
      const r = d.row;
      showTip(event,
        `<strong>${r.regionName}</strong> (${r.year})<br/>
         ${SEX_LABEL[d.sex]}: <b>${d.value.toFixed(1)}</b> years<br/>
         Gap (women \u2212 men): <b>${fmtGap(r.gap)}</b> years<br/>
         Gap change since ${START_YEAR}: <b>${fmtGap(r.gapChange)}</b> years<br/>
         Gap rank: <b>${r.gapRank}</b> of ${REGIONS.length}`);
    })
    .on("mouseout", hideTip)
    .transition().duration(t)
    .attr("x", barX).attr("y", (d) => yW(d.value))
    .attr("width", xWSub.bandwidth())
    .attr("height", (d) => height - yW(d.value));

  svgW.selectAll(".gap-label")
    .data(rows, (r) => r.code)
    .join((enter) =>
      enter.append("text").attr("class", "gap-label")
        .attr("x", (r) => xW(r.region) + xW.bandwidth() / 2)
        .attr("y", height)
    )
    .text((r) => fmtGap(r.gap))
    .transition().duration(t)
    .attr("x", (r) => xW(r.region) + xW.bandwidth() / 2)
    .attr("y", (r) => yW(Math.max(r.female, r.male)) - 5);
}

// black hat visualization
const svgB = makeSvg("#vis2");
const xB = d3.scaleBand().range([0, width]).padding(0.2);
const xBSub = d3.scaleBand().domain(["female", "male"]).padding(0.05);
const yB = d3.scaleLinear().range([height, 0]); // domain changes every year

const gridB = svgB.append("g").attr("class", "y-grid");
const yAxisB = svgB.append("g").attr("class", "y-axis");
const xAxisB = svgB.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
addYAxisTitle(svgB, "Life expectancy at birth (years)");

function updateBlack() {
  const { rows, yMin, yMax } = blackHatData(DATA, targetYear, BLACK_HAT_CODES);
  yB.domain([yMin, yMax]);
  xB.domain(rows.map((r) => r.region));
  xBSub.range([0, xB.bandwidth()]);

  gridB.transition().duration(t).call(d3.axisLeft(yB).tickSize(-width).tickFormat(""));
  yAxisB.transition().duration(t).call(d3.axisLeft(yB).tickPadding(7));
  xAxisB.call(d3.axisBottom(xB)); wrapTicks(xAxisB);

  const stat = headlineStat(rows);
  const hasStat = targetYear !== START_YEAR && stat;
  d3.select("#black-stat-value").text(
    hasStat
      ? `${stat.gapPctChange >= 0 ? "+" : "\u2212"}${Math.abs(stat.gapPctChange).toFixed(0)}%`
      : "\u2014"
  );
  d3.select("#black-stat-region").text(hasStat ? stat.regionName : "Baseline year");

  const bars = rows.flatMap((r) =>
    ["female", "male"].map((sex) => ({ key: r.code + sex, sex, value: r[sex], row: r }))
  );
  const barX = (d) => xB(d.row.region) + xBSub(d.sex);

  svgB.selectAll(".bar")
    .data(bars, (d) => d.key)
    .join((enter) =>
      enter.append("rect")
        .attr("class", (d) => `bar bar-${d.sex}-black`)
        .attr("rx", 3)
        .attr("x", barX).attr("y", height).attr("height", 0)
        .attr("width", xBSub.bandwidth())
    )
    .on("mouseover", (event, d) => {
      showTip(event,
        `<strong>${d.row.regionName}</strong> (${d.row.year})<br/>
         ${SEX_LABEL[d.sex]}: <b>${d.value.toFixed(1)}</b> years`);
    })
    .on("mouseout", hideTip)
    .transition().duration(t)
    .attr("x", barX).attr("y", (d) => yB(d.value))
    .attr("width", xBSub.bandwidth())
    .attr("height", (d) => height - yB(d.value));
}

// controls
function updateAll() {
  updateWhite();
  updateBlack();
}

function setYear(year) {
  targetYear = year;
  const pct = ((year - START_YEAR) / (END_YEAR - START_YEAR)) * 100;
  d3.select("#yearSlider").property("value", year).style("--progress", pct + "%");
  d3.select("#year-display").text(year);
  d3.select("#white-year").text(year);
  d3.select("#black-year").text(year);
  updateAll();
}

let timer = null;
function stopPlaying() {
  if (timer) timer.stop();
  timer = null;
  d3.select("#playIcon").attr("class", "play-icon");
}

function setupControls() {
  d3.select("#yearSlider")
    .attr("min", START_YEAR).attr("max", END_YEAR).attr("step", 1)
    .on("input", function () { stopPlaying(); setYear(+this.value); });

  d3.select("#yearMarks").selectAll("span")
    .data([1960, 1970, 1980, 1990, 2000, 2010, 2019])
    .join("span")
    .style("left", (d) => ((d - START_YEAR) / (END_YEAR - START_YEAR)) * 100 + "%")
    .text((d) => d);

  d3.select("#sortSelect").on("change", function () {
    sortKey = this.value;
    updateWhite();
  });

  d3.select("#playButton").on("click", () => {
    if (timer) { stopPlaying(); return; }
    if (targetYear >= END_YEAR) setYear(START_YEAR);
    d3.select("#playIcon").attr("class", "pause-icon");
    timer = d3.interval(() => {
      if (targetYear >= END_YEAR) { stopPlaying(); return; }
      setYear(targetYear + 1);
    }, PLAY_STEP);
  });
}

d3.csv(DATA_PATH, parseRow)
  .then((rows) => {
    DATA = buildLookups(addDerived(rows));
    BLACK_HAT_CODES = blackHatRegions(DATA);
    console.log("rows:", DATA.rows.length, "(expect 420)");
    console.log("black hat regions:", BLACK_HAT_CODES);
    setupControls();
    setYear(END_YEAR);
  })
  .catch((error) => console.error("Error loading data:", error));