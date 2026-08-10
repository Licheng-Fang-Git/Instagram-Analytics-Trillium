// Shared ECharts styling so every chart in the app reads as one dark,
// on-brand system (Trillium / Claude design language). Import the pieces
// you need and spread them into each chart's option object.

export const BRAND = {
  accent: '#ebffa8', // signature pale yellow
  beige: '#d9d4cb', // warm neutral (secondary series)
  white: '#ffffff',
  subtle: '#787878',
  muted: '#67696f',
  grid: '#1e1e1e', // interior gridlines
  baseline: '#2f2f2f', // the zero baseline / axis line
  legend: '#a8a8a8',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
  sans: 'Montserrat, "Helvetica Neue", Arial, sans-serif',
};

// The color a chart series at position `i` should use. The first two are the
// signature accent + warm neutral; the rest pull distinct, on-brand hues from
// the Trillium palette (ACE spectrum blues/teals/oranges + Trillium Cares
// orange) so a 3rd/4th post reads clearly instead of washing out to white/grey.
const SERIES_COLORS = [
  BRAND.accent, //  #ebffa8  pale yellow (signature accent)
  BRAND.beige, //   #d9d4cb  warm neutral
  '#3e84ff', //     ACE mid-blue
  '#00d1ae', //     ACE turquoise
  '#ff6549', //     Trillium Cares orange
  '#ffb531', //     ACE mustard
  '#ee8134', //     ACE orange
];
export function seriesColor(i) {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}

// Axis tick labels + axis names render white everywhere for legibility on the
// dark surfaces (grey was too dim to read).
export const axisLabel = { color: BRAND.white, fontFamily: BRAND.mono, fontSize: 11 };
export const nameTextStyle = { color: BRAND.white, fontFamily: BRAND.sans, fontSize: 12 };
export const splitLine = { lineStyle: { color: BRAND.grid } };
export const axisLine = { lineStyle: { color: BRAND.baseline } };
export const axisTick = { lineStyle: { color: BRAND.baseline } };

export const brandTooltip = {
  trigger: 'axis',
  backgroundColor: '#000000',
  borderColor: '#2a2a2a',
  borderWidth: 1,
  textStyle: { color: '#ffffff', fontFamily: BRAND.mono, fontSize: 12 },
};

export function brandLegend(data) {
  return {
    bottom: 0,
    data,
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { color: BRAND.legend, fontFamily: BRAND.sans, fontSize: 12 },
  };
}

// A ready-to-spread value axis with brand gridlines + mono labels.
export function valueAxis(extra = {}) {
  return {
    type: 'value',
    axisLabel,
    nameTextStyle,
    splitLine,
    axisLine: { show: false },
    ...extra,
  };
}
