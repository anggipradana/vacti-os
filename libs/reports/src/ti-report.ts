import { reportCss, escapeHtml } from './styles';
import { labels, bi, biText, pri, sec, type Lang } from './i18n';
import {
  cover,
  backCover,
  approvalCards,
  doc,
  section,
  numberedSection,
  miniHead,
  note,
  statRow,
  classificationNote,
  tocList,
} from './shared';
import type { TiReportData } from './types';

const NEWS_STATUS_LABEL: Record<string, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  relevant: 'Relevant',
  actioned: 'Actioned',
  dismissed: 'Irrelevant', // DB value 'dismissed'; mirrors NEWS_STATUS_LABEL in @vacti/core
};

const COMPONENT_LABEL: Record<string, string> = {
  va: 'Vulnerability Assessment',
  leak: 'Credential Exposure',
  exposure: 'Threat Exposure',
  reputation: 'Domain Reputation',
  malware: 'Malware Association',
};

export function renderTiReport(d: TiReportData): string {
  const l = labels(d.lang);
  const s = d.settings;
  const lang: Lang = d.lang;
  const company = s.companyName ?? 'the organisation';
  const css = reportCss(s.primaryColor, s.secondaryColor, s.footerText ?? '', s.classification ?? '');
  const score = Math.max(0, Math.min(100, d.risk.score));
  const riskColor = d.risk.color === 'red' ? '#DC2626' : d.risk.color === 'yellow' ? '#D97706' : '#059669';
  const riskTint = d.risk.color === 'red' ? '#fef2f2' : d.risk.color === 'yellow' ? '#fffbeb' : '#f0fdf4';
  const level = score >= 71 ? 'HIGH' : score >= 31 ? 'MEDIUM' : 'LOW';
  const leakGroups = d.leaks.reduce<Record<string, number>>((a, x) => ((a[x.status] = (a[x.status] ?? 0) + 1), a), {});
  const p2 = (idStr: string, enStr: string) => ({
    primary: lang === 'id' ? idStr : enStr,
    secondary: lang === 'id' ? enStr : idStr,
  });
  const muted = 'style="color:#5b7480"';

  const body: string[] = [];

  body.push(
    cover({
      kicker: biText(lang, pri(lang, 'threatIntelligence'), sec(lang, 'threatIntelligence')),
      title: l.tiTitle,
      target: d.project.name,
      settings: s,
      meta: {
        [l.reportDate]: new Date().toISOString().slice(0, 10),
        [l.riskScore]: `${score} / 100 · ${level}`,
        Leaks: String(d.totals.leaks),
      },
    }),
  );

  // Approval + classification
  body.push(
    section('', pri(lang, 'approvalSheet'), bi(lang, 'approvalSheet')),
    approvalCards(d.signatories, lang),
    miniHead(pri(lang, 'documentClassification'), sec(lang, 'documentClassification')),
    classificationNote(lang, company),
  );

  // Table of contents
  const tnum = (nn: number) => String(nn).padStart(2, '0');
  body.push(
    section('', pri(lang, 'tableOfContents'), bi(lang, 'tableOfContents'), { pageBreak: true }),
    tocList([
      { num: tnum(1), primary: pri(lang, 'executiveSummary'), secondary: sec(lang, 'executiveSummary'), page: '' },
      { num: tnum(2), primary: pri(lang, 'iocTitle'), secondary: sec(lang, 'iocTitle'), page: '' },
      { num: tnum(3), primary: pri(lang, 'breachTitle'), secondary: sec(lang, 'breachTitle'), page: '' },
      { num: tnum(4), primary: pri(lang, 'recommendations'), secondary: sec(lang, 'recommendations'), page: '' },
      ...(d.news?.length
        ? [
            {
              num: tnum(5),
              primary: p2('Berita Keamanan Sektor', 'Sector Security News').primary,
              secondary: p2('Berita Keamanan Sektor', 'Sector Security News').secondary,
              page: '',
            },
          ]
        : []),
    ]),
  );

  // 01 Executive summary
  const riskComp = p2('Komponen Skor Risiko', 'Risk Score Components');
  const manualInd = p2('Indikator Manual', 'Manual Indicators');
  body.push(
    numberedSection(lang, tnum(1), pri(lang, 'executiveSummary'), { pageBreak: true }),
    miniHead(pri(lang, 'aboutAssessment'), sec(lang, 'aboutAssessment')),
    note(
      d.aiNarrative?.trim()
        ? escapeHtml(d.aiNarrative.trim())
        : escapeHtml(
            lang === 'id'
              ? `Penilaian threat-intelligence untuk ${d.project.name}, berdasarkan ${d.totals.pulses} threat pulse, ${d.totals.malware} referensi malware, dan ${d.totals.leaks} kredensial bocor.`
              : `Threat-intelligence assessment for ${d.project.name}, drawing on ${d.totals.pulses} threat pulses, ${d.totals.malware} malware references and ${d.totals.leaks} leaked credentials.`,
          ),
    ),
    `<div class="risk-wrap">
      <div class="risk-num" style="color:${riskColor}">${score}</div>
      <div class="risk-meter"><div style="width:${score}%;background:${riskColor}"></div></div>
      <div class="risk-level" style="background:${riskTint};color:${riskColor}">${level} · ${score}/100</div>
    </div>`,
    statRow([
      { value: d.totals.pulses, ...p2('Threat pulse', 'Threat pulses') },
      { value: d.totals.malware, ...p2('Referensi malware', 'Malware references') },
      { value: d.totals.leaks, ...p2('Kredensial bocor', 'Leaked credentials') },
      { value: d.indicators.length, ...p2('Indikator', 'Indicators') },
    ]),
    d.risk.components
      ? `${miniHead(riskComp.primary, riskComp.secondary)}<table><thead><tr><th>Component</th><th style="text-align:right">Score</th></tr></thead><tbody>
          ${
            Object.entries(d.risk.components)
              .filter(([, v]) => v > 0)
              .map(
                ([k, v]) =>
                  `<tr><td>${escapeHtml(COMPONENT_LABEL[k] ?? k)}</td><td style="text-align:right">${Math.round(v)}</td></tr>`,
              )
              .join('') || '<tr><td colspan="2" class="idx">No active risk contributors.</td></tr>'
          }
          </tbody></table>`
      : '',
  );

  // 02 Indicators of compromise
  body.push(
    numberedSection(lang, tnum(2), pri(lang, 'iocTitle'), { pageBreak: true }),
    `<table><thead><tr><th>Indicator</th><th>Pulses</th><th>Malware</th><th>Reputation</th></tr></thead><tbody>
      ${d.otx.map((o) => `<tr><td class="mono">${escapeHtml(o.indicator)}</td><td>${o.pulses}</td><td>${o.malwareCount}</td><td>${o.reputation}</td></tr>`).join('') || `<tr><td colspan="4" class="idx">${escapeHtml(l.none)} - configure OTX_API_KEY to populate.</td></tr>`}
      </tbody></table>`,
    d.indicators.length
      ? `${miniHead(manualInd.primary, manualInd.secondary)}<table><thead><tr><th>Type</th><th>Value</th></tr></thead><tbody>${d.indicators.map((i) => `<tr><td>${escapeHtml(i.type)}</td><td class="mono">${escapeHtml(i.value)}</td></tr>`).join('')}</tbody></table>`
      : '',
  );

  // 03 Data breach & exposure
  body.push(
    numberedSection(lang, tnum(3), pri(lang, 'breachTitle'), { pageBreak: true }),
    `<p ${muted}>${d.leaks.length} leaked credential(s)${
      Object.keys(leakGroups).length
        ? ` - ${Object.entries(leakGroups)
            .map(([k, nn]) => `${escapeHtml(k)}: ${nn}`)
            .join(' · ')}`
        : ''
    }.</p>`,
    d.leaks.length
      ? `<table><thead><tr><th>Identifier</th><th>Source</th><th>${escapeHtml(l.status)}</th></tr></thead><tbody>
          ${d.leaks
            .slice(0, 200)
            .map(
              (x) =>
                `<tr><td class="mono">${escapeHtml(x.identifier)}</td><td>${escapeHtml(x.source ?? '')}</td><td>${escapeHtml(x.status)}</td></tr>`,
            )
            .join('')}
          </tbody></table>`
      : `<div class="empty">${escapeHtml(l.none)} - configure a leak-intelligence key to populate.</div>`,
  );

  // 04 Recommendations
  body.push(
    numberedSection(lang, tnum(4), pri(lang, 'recommendations'), { pageBreak: true }),
    `<ul>
      ${d.totals.leaks ? '<li>Force-reset and rotate exposed credentials; enforce MFA on affected accounts.</li>' : ''}
      ${d.totals.malware ? '<li>Investigate malware associations against affected hosts and block related IoCs.</li>' : ''}
      ${score >= 31 ? '<li>Prioritise remediation of active findings driving the elevated risk score.</li>' : ''}
      <li>Maintain continuous threat-intelligence monitoring and schedule periodic re-assessment.</li>
    </ul>`,
  );

  // 05 Sector security news (optional - only when populated)
  if (d.news?.length) {
    const newsTitle = p2('Berita Keamanan Sektor', 'Sector Security News');
    const sectorLabel = d.sector ? ` · ${escapeHtml(d.sector)}` : '';
    body.push(
      numberedSection(lang, tnum(5), newsTitle.primary, { pageBreak: true }),
      note(
        escapeHtml(
          lang === 'id'
            ? `Berita serangan & isu keamanan terkini yang relevan dengan sektor${sectorLabel ? ` ${d.sector}` : ''}, dikumpulkan dari sumber intel publik.`
            : `Recent attack news & security developments relevant to the${sectorLabel ? ` ${d.sector}` : ''} sector, aggregated from public intelligence sources.`,
        ),
      ),
      `<table><thead><tr><th>${escapeHtml(lang === 'id' ? 'Judul' : 'Headline')}</th><th>${escapeHtml(lang === 'id' ? 'Sumber' : 'Source')}</th><th>${escapeHtml(lang === 'id' ? 'Tanggal' : 'Date')}</th><th>${escapeHtml(l.status)}</th></tr></thead><tbody>
        ${d.news
          .slice(0, 15)
          .map(
            (n) =>
              `<tr><td>${escapeHtml(n.title)}</td><td>${escapeHtml(n.source)}</td><td class="mono">${n.publishedAt ? n.publishedAt.toISOString().slice(0, 10) : '-'}</td><td>${escapeHtml(NEWS_STATUS_LABEL[n.status] ?? n.status)}</td></tr>`,
          )
          .join('')}
        </tbody></table>`,
    );
  }

  body.push(`<div class="end">${escapeHtml(l.endOfReport)}</div>`);
  body.push(backCover({ settings: s, title: l.tiTitle, endText: l.endOfReport }));
  return doc(l.tiTitle, css, body.join('\n'));
}
