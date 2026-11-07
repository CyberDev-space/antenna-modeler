/** Round values for the marks of an axis from `min` to `max`, about `target` of them. */
export function ticks(min: number, max: number, target = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const rough = span / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((multiple) => multiple * power).find((candidate) => candidate >= rough * 0.999999)!;
  const marks: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + step * 1e-9; k++) {
    marks.push(Number((k * step).toPrecision(12)));
  }
  return marks;
}
