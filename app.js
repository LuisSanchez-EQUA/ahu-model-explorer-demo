const state = { baseline: null, variant: null, active: "baseline", frame: 0, hour: 0, period: [0, 8760], exact: { baseline: null, variant: null }, modeFocus: null, playing: false, timer: null };
const $ = (id) => document.getElementById(id);
const ns = "http://www.w3.org/2000/svg";
const pressure = 101325;
let demoScenarios = [];

function svg(tag, attrs = {}, text = "") {
  const node = document.createElementNS(ns, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}
function setStatus(message, error = false) {
  const box = $("load-status"); box.textContent = message; box.classList.toggle("error", error);
}
function formatHour(hour) {
  const date = new Date(Date.UTC(2026, 0, 1)); date.setUTCMinutes(Math.round(hour * 60));
  return date.toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function inputValueForHour(hour) {
  const date = new Date(Date.UTC(2026, 0, 1)); date.setUTCMinutes(Math.round(hour * 60));
  return date.toISOString().slice(0, 16);
}
function hourFromInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return (Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(2026, 0, 1)) / 3600000;
}
function syncPeriodInputs() { $("period-from").value = inputValueForHour(state.period[0]); $("period-to").value = inputValueForHour(state.period[1]); }
function activeData() { return state[state.active]; }
function otherKind() { return state.active === "baseline" ? "variant" : "baseline"; }
function otherData() { return state[otherKind()]; }
function frameIndexAt(hour, edge = "nearest", data = activeData()) {
  const frames = data.frames;
  if (edge === "start") return Math.max(0, frames.findIndex((frame) => frame.h >= hour));
  if (edge === "end") { for (let index = frames.length - 1; index >= 0; index -= 1) if (frames[index].h <= hour) return index; return frames.length - 1; }
  return frames.reduce((closest, frame, index) => Math.abs(frame.h - hour) < Math.abs(frames[closest].h - hour) ? index : closest, 0);
}
function rhFromTW(t, w) {
  const ps = 610.94 * Math.exp((17.625 * t) / (t + 243.04));
  const pw = (w * pressure) / (0.621945 + w);
  return Math.max(0, Math.min(100, 100 * pw / ps));
}
function scale(value, domain, range) { return range[0] + ((value - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]); }
function current(data) {
  if (data === state.baseline && state.exact.baseline) return state.exact.baseline;
  if (data === state.variant && state.exact.variant) return state.exact.variant;
  return data.frames[frameIndexAt(state.hour, "nearest", data)];
}
function hasOverlay() { return $("show-variant").checked && otherData(); }

async function loadScenario(kind) {
  const scenario = $(`${kind}-scenario`).value;
  if (!scenario) return setStatus("No bundled demo scenarios were found.", true);
  setStatus(`Reading scenario ${scenario}…`);
  try { const response = await fetch(`data/scenario-${encodeURIComponent(scenario)}.json`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not read the bundled scenario."); setDataset(kind, data); }
  catch (error) { setStatus(error.message || "Could not read this scenario.", true); }
}
async function refreshScenarios(loadFirst = false) {
  setStatus("Loading bundled demo scenarios…");
  try {
    const response = await fetch("data/scenarios.json"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not find bundled scenarios.");
    demoScenarios = data.scenarios || [];
    const selectors = [$("baseline-scenario"), $("variant-scenario")];
    selectors.forEach((selector) => {
      const previous = selector.value;
      selector.replaceChildren(...demoScenarios.map((scenario) => { const option = document.createElement("option"); option.value = scenario.id; option.textContent = scenario.label; return option; }));
      selector.value = demoScenarios.some((scenario) => scenario.id === previous) ? previous : demoScenarios[selector.id.startsWith("variant") && demoScenarios.length > 1 ? 1 : 0]?.id || "";
    });
    if (!demoScenarios.length) throw new Error("The prototype contains no demo scenarios.");
    setStatus(`${demoScenarios.length} bundled demo scenario${demoScenarios.length === 1 ? "" : "s"} loaded.`);
    if (loadFirst) loadScenario("baseline");
  } catch (error) { setStatus(error.message, true); }
}
function setDataset(kind, data) {
  state[kind] = data; state.exact[kind] = null; state.frame = 0; if (kind === "baseline") { state.active = "baseline"; state.hour = 0; state.period = [0, 8760]; syncPeriodInputs(); } updateDisplaySelector(); $("explorer").hidden = false;
  $("time-slider").max = data.frames.length - 1;
  setStatus(`${data.name}: ${data.source_rows.toLocaleString()} source samples, ${data.frames.length.toLocaleString()} playback frames.`);
  render();
}
function updateDisplaySelector() {
  const selectors = [$("display-scenario"), $("side-display-scenario")]; const available = [["baseline", state.baseline], ["variant", state.variant]].filter(([, data]) => data);
  if (!available.some(([kind]) => kind === state.active)) state.active = available[0]?.[0] || "baseline";
  selectors.forEach((select) => { select.replaceChildren(...available.map(([kind, data]) => { const option = document.createElement("option"); option.value = kind; option.textContent = data.name; return option; })); select.value = state.active; select.disabled = available.length < 2; });
}

function modeLabel(mode) { return mode === "neutral" ? "Neutral / no active conditioning" : mode.replaceAll(" + ", " + ").replace(/(^| \+ )([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`); }
function renderModeSummary() {
  const summary = activeData()?.mode_summary || [];
  const body = $("mode-summary");
  body.replaceChildren(...summary.map(({ mode, samples, percent }) => {
    const row = document.createElement("tr");
    const button = document.createElement("button");
    button.type = "button"; button.className = "mode-row-button"; button.textContent = modeLabel(mode); button.setAttribute("aria-pressed", String(state.modeFocus === mode));
    button.addEventListener("click", () => { state.modeFocus = state.modeFocus === mode ? null : mode; render(); });
    const modeCell = document.createElement("td"); modeCell.append(button);
    const duration = document.createElement("td"); duration.textContent = `${(percent * 87.6).toFixed(0)} h`;
    const share = document.createElement("td"); share.textContent = `${percent.toFixed(2)}%`;
    row.append(modeCell, duration, share);
    return row;
  }));
  $("clear-mode-highlight").hidden = !state.modeFocus;
}

function renderChart() {
  const data = activeData(); if (!data) return;
  const chart = $("psychrometric-chart"); chart.replaceChildren();
  const width = Math.max(320, chart.clientWidth || 760), height = Math.max(380, chart.clientHeight || 490);
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const margin = { top: 24, right: 20, bottom: 45, left: 56 };
  const frames = [current(data), ...(hasOverlay() ? [current(otherData())] : [])];
  const allT = frames.flatMap((frame) => [...frame.t, frame.return[0]]); const allW = frames.flatMap((frame) => [...frame.w.map((value) => value * 1000), frame.return[1] * 1000]);
  const xDomain = [Math.min(-20, Math.floor(Math.min(...allT) / 5) * 5), Math.max(40, Math.ceil(Math.max(...allT) / 5) * 5)];
  const yDomain = [0, Math.max(18, Math.ceil(Math.max(...allW) + 2))];
  const x = (v) => scale(v, xDomain, [margin.left, width - margin.right]);
  const y = (v) => scale(v, yDomain, [height - margin.bottom, margin.top]);

  for (let t = xDomain[0]; t <= xDomain[1]; t += 5) {
    chart.append(svg("line", { x1: x(t), y1: margin.top, x2: x(t), y2: height - margin.bottom, class: "grid" }));
    chart.append(svg("text", { x: x(t), y: height - 24, class: "axis", "text-anchor": "middle" }, t));
  }
  for (let w = 0; w <= yDomain[1]; w += 2) {
    chart.append(svg("line", { x1: margin.left, y1: y(w), x2: width - margin.right, y2: y(w), class: "grid" }));
    chart.append(svg("text", { x: margin.left - 8, y: y(w) + 4, class: "axis", "text-anchor": "end" }, w));
  }
  // Saturation and RH reference curves calculated at the selected standard pressure.
  [1, .8, .6, .4, .2].forEach((fraction) => {
    const points = [];
    for (let temp = xDomain[0]; temp <= xDomain[1]; temp += .4) {
      const ps = 610.94 * Math.exp((17.625 * temp) / (temp + 243.04)); const w = 0.621945 * fraction * ps / (pressure - fraction * ps) * 1000;
      if (w >= yDomain[0] && w <= yDomain[1]) points.push({ x: x(temp), y: y(w) });
    }
    chart.append(svg("path", { d: `M${points.map((point) => `${point.x},${point.y}`).join(" L")}`, fill: "none", stroke: "#bccdcd", "stroke-width": fraction === 1 ? 1.5 : 1 }));
    const labelPoint = points[points.length - 1];
    if (labelPoint) chart.append(svg("text", { x: labelPoint.x - 4, y: labelPoint.y - 5, class: "rh-label", "text-anchor": "end" }, `${Math.round(fraction * 100)}% RH`));
  });
  chart.append(svg("rect", { x: margin.left, y: margin.top, width: width - margin.left - margin.right, height: height - margin.top - margin.bottom, fill: "none", stroke: "#aebfc0" }));
  chart.append(svg("text", { x: (margin.left + width - margin.right) / 2, y: height - 5, class: "chart-title", "text-anchor": "middle" }, "Dry-bulb temperature (°C)"));
  chart.append(svg("text", { x: 14, y: height / 2, class: "chart-title", transform: `rotate(-90 14 ${height / 2})`, "text-anchor": "middle" }, "Humidity ratio (g/kg dry air)"));
  drawProcess(chart, current(data), x, y, state.active, true, true);
  if (hasOverlay()) drawProcess(chart, current(otherData()), x, y, otherKind(), false, false);
}
function drawProcess(chart, frame, x, y, scenario, active, labels) {
  const supplyPoints = frame.t.map((temp, index) => [x(temp), y(frame.w[index] * 1000)]);
  const points = [...supplyPoints, [x(frame.return[0]), y(frame.return[1] * 1000)]];
  const scenarioClass = scenario === "baseline" ? "scenario-one" : "scenario-two";
  const stateClass = active ? "active-process" : "comparison-process";
  chart.append(svg("polyline", { points: supplyPoints.map((p) => p.join(",")).join(" "), class: `${scenarioClass}-path process-line ${stateClass}` }));
  chart.append(svg("line", { x1: supplyPoints[6][0], y1: supplyPoints[6][1], x2: points[7][0], y2: points[7][1], class: `${scenarioClass}-return return-line ${stateClass}` }));
  points.forEach((point, index) => {
    chart.append(svg("circle", { cx: point[0], cy: point[1], r: 5.5, class: `point ${scenarioClass}-point ${stateClass}` }));
    if (labels) chart.append(svg("text", { x: point[0] + 8, y: point[1] - 8, class: "point-label" }, index + 1));
  });
}

function renderDetails() {
  const frame = current(activeData()); if (!frame) return;
  $("time-jump").value = inputValueForHour(frame.h); $("mode-badge").textContent = frame.mode;
  const setAirState = (name, temperature, humidity, massFlow) => {
    $(`${name}-t`).textContent = temperature.toFixed(1);
    $(`${name}-rh`).textContent = rhFromTW(temperature, humidity).toFixed(0);
    $(`${name}-w`).textContent = (humidity * 1000).toFixed(2);
    $(`${name}-m`).textContent = `${massFlow.toFixed(4)}`;
  };
  setAirState("outdoor", frame.t[0], frame.w[0], frame.m[0]);
  setAirState("supply", frame.t[6], frame.w[6], frame.m[6]);
  setAirState("return", frame.return[0], frame.return[1], frame.m[7]);
  $("flow-supply").textContent = frame.volume.supply.toFixed(1);
  $("flow-return").textContent = frame.volume.return.toFixed(1);
  const netFlow = frame.volume.supply - frame.volume.return;
  $("flow-net").textContent = `${netFlow >= 0 ? "+" : ""}${netFlow.toFixed(1)}`;
  $("set-rh").textContent = (frame.set.rh_set * 100).toFixed(1);
  $("set-hc1").textContent = frame.set.hc1.toFixed(1);
  $("set-cc").textContent = frame.set.cc.toFixed(1);
  $("set-hc2").textContent = frame.set.hc2.toFixed(1);
  const stages = [["Heat recovery · 1→2", frame.t[1]-frame.t[0], frame.w[1]-frame.w[0]], ["Preheater HC1 · 2→3", frame.t[2]-frame.t[1], frame.w[2]-frame.w[1]], ["Evaporative humidifier · 3→4", frame.t[3]-frame.t[2], frame.w[3]-frame.w[2]], ["Cooling coil · 4→5", frame.t[4]-frame.t[3], frame.w[4]-frame.w[3]], ["Final heater HC2 · 5→6", frame.t[5]-frame.t[4], frame.w[5]-frame.w[4]], ["Supply fan · 6→7", frame.t[6]-frame.t[5], frame.w[6]-frame.w[5]]];
  $("stage-list").replaceChildren(...stages.map(([label, dt, dw]) => {
    const row = document.createElement("tr");
    const value = (number, precision, threshold) => Math.abs(number) < threshold ? "—" : `${number > 0 ? "+" : ""}${number.toFixed(precision)}`;
    row.innerHTML = `<td>${label}</td><td class="${Math.abs(dt) < .05 ? "inactive" : ""}">${value(dt, 1, .05)}</td><td class="${Math.abs(dw) < .00001 ? "inactive" : ""}">${value(dw * 1000, 2, .01)}</td>`;
    return row;
  }));
  $("active-legend").innerHTML = `<i class="swatch baseline"></i>${state.baseline?.name || "Scenario 1"} supply process`;
  $("variant-legend").innerHTML = `<i class="swatch variant"></i>${state.variant?.name || "Scenario 2"} supply process`;
  $("active-legend").classList.toggle("comparison-legend", state.active !== "baseline");
  $("variant-legend").classList.toggle("comparison-legend", state.active !== "variant");
  $("variant-legend").hidden = !hasOverlay();
}
function modeCategory(mode) { if (mode.includes("humidification")) return "humidification"; if (mode.includes("dehumidification")) return "dehumidification"; if (mode.includes("sensible cooling")) return "sensible cooling"; if (mode.includes("preheat") || mode.includes("reheat")) return "heating"; return "neutral"; }
function modeColor(mode) { return {humidification:"#277a73", dehumidification:"#2a75a8", "sensible cooling":"#75a9cb", heating:"#b75134", neutral:"#9babae"}[modeCategory(mode)]; }
function drawMonthAxis(chart, x, height) {
  for(let month=0;month<12;month++){const date=new Date(Date.UTC(2026,month,1));const hours=(date-Date.UTC(2026,0,1))/3600000;chart.append(svg("text",{x:x(hours),y:height-9,class:"axis","text-anchor":month===0?"start":"middle"},date.toLocaleString("en-GB",{month:"short",timeZone:"UTC"})));}
}
function drawPeriodAxis(chart, x, height, domain) {
  const span = domain[1] - domain[0];
  [0, .25, .5, .75, 1].forEach((fraction) => { const hour = domain[0] + span * fraction; const date = new Date(Date.UTC(2026, 0, 1)); date.setUTCMinutes(Math.round(hour * 60)); const options = span <= 72 ? {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"UTC"} : {day:"2-digit", month:"short", timeZone:"UTC"}; chart.append(svg("text", {x:x(hour), y:height-9, class:"axis", "text-anchor": fraction === 0 ? "start" : "middle"}, date.toLocaleString("en-GB", options))); });
}
function drawCloseupAxis(chart, x, height, domain) {
  const span = domain[1] - domain[0];
  [0, .25, .5, .75, 1].forEach((fraction) => { const hour = domain[0] + span * fraction; const date = new Date(Date.UTC(2026, 0, 1)); date.setUTCMinutes(Math.round(hour * 60)); chart.append(svg("text", {x:x(hour), y:height-9, class:"axis", "text-anchor": fraction === 0 ? "start" : "middle"}, date.toLocaleString("en-GB", {hour:"2-digit", minute:"2-digit", timeZone:"UTC"}))); });
}
function drawModeHighlights(chart, x, top, bottom, timeDomain) {
  if (!state.modeFocus) return;
  const matching = activeData().frames.filter((frame) => frame.mode === state.modeFocus && frame.h >= timeDomain[0] && frame.h <= timeDomain[1]);
  const step = activeData().frames.length > 1 ? activeData().frames[1].h - activeData().frames[0].h : 0;
  matching.forEach((frame) => chart.append(svg("rect", { x: x(frame.h - step / 2), y: top, width: Math.max(1, x(frame.h + step / 2) - x(frame.h - step / 2)), height: bottom - top, class: "mode-highlight" })));
}
function renderConditionTimeline(id, series, unit, domain, timeDomain=[0,8760], closeup=false) {
  const data=activeData(), chart=$(id); chart.replaceChildren(); const width=Math.max(220,chart.clientWidth||1000),height=closeup ? 122 : 135,margin={top:10,right:12,bottom:28,left:43}; chart.setAttribute("viewBox",`0 0 ${width} ${height}`);
  const x=(hour)=>scale(hour,timeDomain,[margin.left,width-margin.right]); const y=(value)=>scale(value,domain,[height-margin.bottom,margin.top]);
  const divisions=4; for(let i=0;i<=divisions;i++){const value=domain[0]+((domain[1]-domain[0])*i/divisions);const label=unit === "kg/s" ? value.toFixed(3) : Math.round(value);chart.append(svg("line",{x1:margin.left,y1:y(value),x2:width-margin.right,y2:y(value),class:"grid"}));chart.append(svg("text",{x:margin.left-7,y:y(value)+4,class:"axis","text-anchor":"end"},label));}
  chart.append(svg("rect",{x:margin.left,y:margin.top,width:width-margin.left-margin.right,height:height-margin.top-margin.bottom,fill:"none",stroke:"#aebfc0"}));
  const selection=data.frames.filter((frame)=>frame.h >= timeDomain[0] && frame.h <= timeDomain[1]);
  drawModeHighlights(chart, x, margin.top, height-margin.bottom, timeDomain);
  series.forEach(({value,color})=>{const d=selection.map((frame,index)=>`${index?"L":"M"}${x(frame.h)},${y(value(frame))}`).join(" ");chart.append(svg("path",{d,fill:"none",stroke:color,"stroke-width":1.45}));});
  const selected=current(data); chart.append(svg("line",{x1:x(selected.h),y1:margin.top,x2:x(selected.h),y2:height-margin.bottom,class:"timeline-selection"})); if(closeup) drawCloseupAxis(chart,x,height,timeDomain); else if (timeDomain[0] === 0 && timeDomain[1] === 8760) drawMonthAxis(chart,x,height); else drawPeriodAxis(chart,x,height,timeDomain);
}
function renderModeTimeline(id, timeDomain=[0,8760], closeup=false) {
  const data=activeData(),chart=$(id);chart.replaceChildren();const width=Math.max(220,chart.clientWidth||1000),height=70,margin={top:7,right:12,bottom:25,left:43};chart.setAttribute("viewBox",`0 0 ${width} ${height}`);const x=(hour)=>scale(hour,timeDomain,[margin.left,width-margin.right]);
  const selection=data.frames.filter((frame)=>frame.h >= timeDomain[0] && frame.h <= timeDomain[1]); let start=0; for(let i=1;i<=selection.length;i++){if(i===selection.length||modeCategory(selection[i].mode)!==modeCategory(selection[start].mode)){const category=modeCategory(selection[start].mode);const end=selection[Math.min(i,selection.length-1)].h;chart.append(svg("rect",{x:x(selection[start].h),y:margin.top,width:Math.max(1,x(end)-x(selection[start].h)),height:height-margin.top-margin.bottom,fill:modeColor(category),class:"mode-band"}));start=i;}}
  drawModeHighlights(chart, x, margin.top, height-margin.bottom, timeDomain);
  chart.append(svg("rect",{x:margin.left,y:margin.top,width:width-margin.left-margin.right,height:height-margin.top-margin.bottom,fill:"none",stroke:"#aebfc0"}));const selected=current(data);chart.append(svg("line",{x1:x(selected.h),y1:margin.top,x2:x(selected.h),y2:height-margin.bottom,class:"timeline-selection"})); if(closeup) drawCloseupAxis(chart,x,height,timeDomain); else if (timeDomain[0] === 0 && timeDomain[1] === 8760) drawMonthAxis(chart,x,height); else drawPeriodAxis(chart,x,height,timeDomain);
}
function periodTitle() { const [from, to] = state.period; if (from === 0 && to === 8760) return "full year"; return `${formatHour(from)} – ${formatHour(to)}`; }
function seriesDomain(series, timeDomain) { const values=activeData().frames.filter((frame)=>frame.h >= timeDomain[0] && frame.h <= timeDomain[1]).flatMap((frame)=>series.map(({value})=>value(frame))); const minimum=Math.min(...values), maximum=Math.max(...values), padding=Math.max(.0002,(maximum-minimum)*.12); return [minimum-padding, maximum+padding]; }
function renderTimeline() { if (!activeData()) return; const temperatureSeries=[{value:(f)=>f.t[0],color:"#64748b"},{value:(f)=>f.t[6],color:"#196b89"},{value:(f)=>f.return[0],color:"#b75134"}], humiditySeries=[{value:(f)=>rhFromTW(f.t[0],f.w[0]),color:"#64748b"},{value:(f)=>rhFromTW(f.t[6],f.w[6]),color:"#196b89"},{value:(f)=>rhFromTW(f.return[0],f.return[1]),color:"#b75134"}], massFlowSeries=[{value:(f)=>f.m[0],color:"#64748b"},{value:(f)=>f.m[6],color:"#196b89"},{value:(f)=>f.m[7],color:"#b75134"},{value:(f)=>f.m[8],color:"#718a82"}]; const center=current(activeData()).h; const hours=+$("closeup-hours").value; const start=Math.max(state.period[0],Math.min(state.period[1]-hours,center-hours/2)); const window=[start,Math.min(state.period[1],start+hours)]; const title = periodTitle(); $("temperature-overview-title").textContent=`Temperatures · °C · ${title}`; $("humidity-overview-title").textContent=`Relative humidities · % · ${title}`; $("massflow-overview-title").textContent=`Air mass flow · kg/s · ${title}`; $("closeup-title").textContent=`Close-up · ${hours < 24 ? `${hours} h` : hours === 24 ? "24 h" : hours === 48 ? "48 h" : "7 days"}`; renderConditionTimeline("temperature-timeline",temperatureSeries,"°C",[-15,35],state.period); renderConditionTimeline("humidity-timeline",humiditySeries,"%",[0,100],state.period); renderConditionTimeline("massflow-timeline",massFlowSeries,"kg/s",seriesDomain(massFlowSeries,state.period),state.period); renderConditionTimeline("temperature-closeup",temperatureSeries,"°C",[-15,35],window,true); renderConditionTimeline("humidity-closeup",humiditySeries,"%",[0,100],window,true); renderConditionTimeline("massflow-closeup",massFlowSeries,"kg/s",seriesDomain(massFlowSeries,window),window,true); }
function render() { if (!activeData()) return; const slider=$("time-slider"); state.frame = frameIndexAt(state.hour); slider.min=state.period[0]; slider.max=state.period[1]; slider.value = state.hour; renderChart(); renderDetails(); renderModeSummary(); renderTimeline(); }
function clearExactSelection() { state.exact.baseline = null; state.exact.variant = null; }
function step(amount) { clearExactSelection(); const frames=activeData().frames; const min=frameIndexAt(state.period[0],"start"), max=frameIndexAt(state.period[1],"end"); state.frame=state.frame+amount; if(state.frame>max) state.frame=min; if(state.frame<min) state.frame=max; state.hour=frames[state.frame].h; render(); }
function togglePlay() { state.playing=!state.playing; $("play").setAttribute("aria-pressed",state.playing); $("play").textContent=state.playing?"Pause":"Play"; clearInterval(state.timer); if(state.playing) state.timer=setInterval(()=>step(+$("playback-speed").value), 140); }

async function jumpToDateTime() {
  const hour = hourFromInput($("time-jump").value);
  if (hour === null || hour < 0 || hour > 8760) return setStatus("Choose a date and time within 2026.", true);
  if (hour < state.period[0] || hour > state.period[1]) return setStatus("The selected time is outside the displayed period. Reset or adjust the period first.", true);
  clearExactSelection();
  const frame = activeData().frames[frameIndexAt(hour)];
  state.hour = frame.h; state.frame = frameIndexAt(state.hour);
  setStatus(`Selected nearest bundled playback timestep: ${formatHour(frame.h)}.`); render();
}

function applyPeriod() {
  const from = hourFromInput($("period-from").value), to = hourFromInput($("period-to").value);
  if (from === null || to === null || from < 0 || to > 8760 || from >= to) return setStatus("Choose a valid From and To time within 2026.", true);
  state.period = [from, to]; clearExactSelection(); state.frame = frameIndexAt(from, "start"); state.hour = activeData().frames[state.frame].h; render();
}
function resetPeriod() { state.period = [0, 8760]; syncPeriodInputs(); render(); }
async function copyScript() {
  try { const response = await fetch("ahu_points_export_script.txt"); const script = await response.text(); await navigator.clipboard.writeText(script); setStatus("IDA point-export script copied to the clipboard."); }
  catch { setStatus("Could not copy the script. Your browser may block clipboard access.", true); }
}

function switchActiveScenario(kind) {
  if (!state[kind] || kind === state.active) return;
  const hour = current(activeData()).h;
  state.active = kind;
  clearExactSelection();
  state.hour = hour; state.frame = frameIndexAt(hour);
  updateDisplaySelector();
  render();
}

$("load-baseline").addEventListener("click",()=>loadScenario("baseline")); $("load-variant").addEventListener("click",()=>loadScenario("variant")); $("refresh-scenarios").addEventListener("click",()=>refreshScenarios(false)); $("copy-script").addEventListener("click",copyScript); $("display-scenario").addEventListener("change",(event)=>switchActiveScenario(event.target.value)); $("side-display-scenario").addEventListener("change",(event)=>switchActiveScenario(event.target.value)); $("show-variant").addEventListener("change",render); $("time-slider").addEventListener("input",(event)=>{clearExactSelection();state.hour=+event.target.value;state.frame=frameIndexAt(state.hour);render();}); $("go-time").addEventListener("click",jumpToDateTime); $("apply-period").addEventListener("click",applyPeriod); $("reset-period").addEventListener("click",resetPeriod); $("clear-mode-highlight").addEventListener("click",()=>{state.modeFocus=null;render();}); $("closeup-hours").addEventListener("change",render); $("play").addEventListener("click",togglePlay); $("previous").addEventListener("click",()=>step(-1)); $("next").addEventListener("click",()=>step(1)); window.addEventListener("resize",()=>{ if(activeData()) render(); });

// This prototype is fully static: the approved demo scenarios are prebuilt as
// JSON assets and are never uploaded or changed by a browser user.
refreshScenarios(true);
