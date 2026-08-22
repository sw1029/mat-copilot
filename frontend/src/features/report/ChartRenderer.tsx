import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartSpec, Finding } from '../../shared/api/types';
import { announce } from '../../shared/a11y/liveRegion';
import { inferChartType, parseCsv, toChartData } from '../../shared/utils/csv';
import type { ParsedCsv } from '../../shared/utils/csv';
import { useReportStore } from '../../stores/reportStore';
import { getThemeLabel, themeFromLabel } from './constants';
import { prefersReducedMotion } from './reportUtils';
import styles from './ChartRenderer.module.css';

const PIE_COLORS = ['#7c4ddc', '#9d74ea', '#bda0f4', '#d9c7fb', '#ede4ff'];

function DataTable({ parsed, title }: { parsed: ParsedCsv; title: string }) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <caption>{title}</caption>
        <thead>
          <tr>{parsed.headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, rowIndex) => (
            <tr key={`${row.join('|')}-${rowIndex}`}>
              {parsed.headers.map((header, columnIndex) => <td key={header}>{row[columnIndex] ?? ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartRenderer({ spec, findings }: { spec: ChartSpec; findings: Finding[] }) {
  const selectFinding = useReportStore((state) => state.selectFinding);
  const selectedFindingId = useReportStore((state) => state.selectedFindingId);
  const hoveredFindingId = useReportStore((state) => state.hoveredFindingId);

  let parsed: ParsedCsv;
  try {
    parsed = parseCsv(spec.csv);
  } catch {
    parsed = { headers: [], rows: [] };
  }
  const type = inferChartType(parsed, spec.xAxisName);
  const data = toChartData(parsed);
  const firstSeries = parsed.headers[1] ?? spec.yAxisName;
  const activeFinding = findings.find((finding) => finding.findingId === selectedFindingId || finding.findingId === hoveredFindingId);
  const activeLabel = activeFinding ? getThemeLabel(activeFinding) : undefined;

  const selectByDatum = (name: string) => {
    const mappedTheme = themeFromLabel(name);
    const match = findings.find((finding) =>
      mappedTheme ? finding.theme === mappedTheme : getThemeLabel(finding) === name || finding.dynamicThemeName === name,
    );
    if (!match) return;
    selectFinding(match.findingId);
    announce(`${match.summary} 선택됨`);
  };

  const opacityFor = (name: string) => (!activeLabel || activeLabel === name ? 1 : 0.45);
  const animation = !prefersReducedMotion();

  const chart = (() => {
    if (type === 'metric') {
      const value = data[0]?.[firstSeries] ?? '-';
      return <div className={styles.metric}>{String(value)}</div>;
    }
    if (type === 'line') {
      return (
        <div className={styles.chart} role="img" aria-label={`${spec.title} 차트`}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={firstSeries} stroke="var(--color-primary-500)" isAnimationActive={animation} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }
    if (type === 'pie') {
      return (
        <div className={styles.chart} role="img" aria-label={`${spec.title} 차트`}>
          <ResponsiveContainer>
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie data={data} dataKey={firstSeries} nameKey="name" isAnimationActive={animation}>
                {data.map((datum, index) => (
                  <Cell
                    key={datum.name}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                    opacity={opacityFor(datum.name)}
                    onClick={() => selectByDatum(datum.name)}
                    cursor="pointer"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }
    if (type === 'bar') {
      return (
        <div className={styles.chart} role="img" aria-label={`${spec.title} 차트`}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={firstSeries} fill="var(--color-primary-400)" radius={6} isAnimationActive={animation}>
                {data.map((datum) => (
                  <Cell key={datum.name} opacity={opacityFor(datum.name)} onClick={() => selectByDatum(datum.name)} cursor="pointer" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }
    return <DataTable parsed={parsed} title={spec.title} />;
  })();

  return (
    <article className={styles.card}>
      <h3 className={styles.title}>{spec.title}</h3>
      {spec.description && <p className={styles.description}>{spec.description}</p>}
      {parsed.headers.length === 0 ? <p className={styles.error}>차트 데이터를 표로 표시할 수 없어요.</p> : chart}
      {parsed.headers.length > 0 && type !== 'table' && (
        <details className={styles.tableToggle}>
          <summary>표로 보기</summary>
          <DataTable parsed={parsed} title={spec.title} />
        </details>
      )}
    </article>
  );
}
