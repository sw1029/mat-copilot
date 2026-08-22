// TRD/front.md §7.8 — ChartSpec.csv 경량 내부 파서 (OQ-FE-03: 내부 파서 채택).
// 헤더 포함 CSV를 파싱하고 차트 유형을 추론한다. 확신 불가 시 표 fallback.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export type InferredChartType = 'bar' | 'line' | 'pie' | 'metric' | 'table';

/** 따옴표/이스케이프를 지원하는 최소 CSV 파서 */
export function parseCsv(csv: string): ParsedCsv {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(current);
    current = '';
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch !== '\r') {
      current += ch;
    }
  }
  if (current.length > 0 || row.length > 0) pushRow();

  const [headers = [], ...dataRows] = rows;
  return { headers, rows: dataRows };
}

export function isNumericColumn(rows: string[][], columnIndex: number): boolean {
  if (rows.length === 0) return false;
  return rows.every((r) => {
    const value = r[columnIndex]?.trim() ?? '';
    return value !== '' && Number.isFinite(Number(value));
  });
}

/**
 * TRD §7.8 자동 선택 규칙:
 * 행 1개 = metric card, 범주+값 = bar, time/order 축 = line,
 * theme counts = pie/bar, 그 외 = table fallback.
 */
export function inferChartType(parsed: ParsedCsv, xAxisName: string): InferredChartType {
  const { headers, rows } = parsed;
  if (headers.length < 2 || rows.length === 0) return 'table';
  if (rows.length === 1 && headers.length === 2 && isNumericColumn(rows, 1)) return 'metric';

  const valueColumnsNumeric = headers.slice(1).every((_, idx) => isNumericColumn(rows, idx + 1));
  if (!valueColumnsNumeric) return 'table';

  const timeLike = /(time|date|order|step|day|week|월|일|순서|시간)/i;
  if (timeLike.test(headers[0]) || timeLike.test(xAxisName)) return 'line';

  const themeLike = /(theme|테마|유형|분류|category)/i;
  if ((themeLike.test(headers[0]) || themeLike.test(xAxisName)) && rows.length <= 6) return 'pie';

  return 'bar';
}

export interface ChartDatum {
  name: string;
  [seriesName: string]: string | number;
}

export function toChartData(parsed: ParsedCsv): ChartDatum[] {
  return parsed.rows.map((row) => {
    const datum: ChartDatum = { name: row[0] ?? '' };
    parsed.headers.slice(1).forEach((header, idx) => {
      const raw = row[idx + 1] ?? '';
      const numeric = Number(raw);
      datum[header] = Number.isFinite(numeric) && raw.trim() !== '' ? numeric : raw;
    });
    return datum;
  });
}
