import { describe, expect, it } from 'vitest';
import { inferChartType, isNumericColumn, parseCsv, toChartData } from './csv';

describe('parseCsv', () => {
  it('헤더와 데이터 행을 분리한다', () => {
    const parsed = parseCsv('theme,count\n요구 누락,3\n의도 왜곡,1');
    expect(parsed.headers).toEqual(['theme', 'count']);
    expect(parsed.rows).toEqual([
      ['요구 누락', '3'],
      ['의도 왜곡', '1'],
    ]);
  });

  it('따옴표 안의 쉼표와 이스케이프된 따옴표를 처리한다', () => {
    const parsed = parseCsv('name,value\n"a, b",1\n"say ""hi""",2');
    expect(parsed.rows).toEqual([
      ['a, b', '1'],
      ['say "hi"', '2'],
    ]);
  });

  it('CRLF와 마지막 개행을 허용한다', () => {
    const parsed = parseCsv('a,b\r\n1,2\r\n');
    expect(parsed.headers).toEqual(['a', 'b']);
    expect(parsed.rows).toEqual([['1', '2']]);
  });
});

describe('isNumericColumn', () => {
  it('모든 값이 숫자면 true', () => {
    expect(isNumericColumn([['x', '1'], ['y', '2.5']], 1)).toBe(true);
  });
  it('빈 값/문자 포함 시 false', () => {
    expect(isNumericColumn([['x', '1'], ['y', '']], 1)).toBe(false);
    expect(isNumericColumn([['x', 'abc']], 1)).toBe(false);
  });
});

describe('inferChartType (TRD §7.8 자동 선택 규칙)', () => {
  it('행 1개 + 숫자 1열 → metric', () => {
    expect(inferChartType(parseCsv('label,value\n커버리지,80'), 'label')).toBe('metric');
  });
  it('time/order 축 → line', () => {
    expect(inferChartType(parseCsv('day,count\n1,2\n2,3'), 'day')).toBe('line');
    expect(inferChartType(parseCsv('구간,값\n1,2\n2,3'), '시간')).toBe('line');
  });
  it('theme 축 + 6행 이하 → pie', () => {
    expect(inferChartType(parseCsv('테마,건수\n요구 누락,3\n범위 초과,1'), '테마')).toBe('pie');
  });
  it('범주 + 숫자 → bar', () => {
    expect(inferChartType(parseCsv('module,count\nauth,3\nui,1'), 'module')).toBe('bar');
  });
  it('숫자가 아닌 값 열 → table fallback', () => {
    expect(inferChartType(parseCsv('a,b\nx,foo'), 'a')).toBe('table');
  });
  it('데이터 없음/열 부족 → table fallback', () => {
    expect(inferChartType(parseCsv('only'), 'only')).toBe('table');
    expect(inferChartType(parseCsv('a,b'), 'a')).toBe('table');
  });
});

describe('toChartData', () => {
  it('첫 열을 name으로, 나머지를 숫자 시리즈로 변환한다', () => {
    const data = toChartData(parseCsv('theme,count,weight\n누락,3,1.5\n왜곡,1,0.2'));
    expect(data).toEqual([
      { name: '누락', count: 3, weight: 1.5 },
      { name: '왜곡', count: 1, weight: 0.2 },
    ]);
  });
  it('숫자가 아닌 값은 문자열로 보존한다', () => {
    const data = toChartData(parseCsv('a,b\nx,n/a'));
    expect(data[0].b).toBe('n/a');
  });
});
