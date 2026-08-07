export type Lang = 'en' | 'id';

const dict = {
  en: {
    vaTitle: 'Vulnerability Assessment Report',
    tiTitle: 'Cyber Threat Intelligence Report',
    reportDate: 'Report date',
    documentNumber: 'Document number',
    project: 'Project',
    preparedBy: 'Prepared By',
    reviewedBy: 'Reviewed By',
    approvedBy: 'Approved By',
    approvalSheet: 'Approval Sheet',
    executiveSummary: 'Executive Summary',
    scope: 'Scope & Timeline',
    summaryOfFindings: 'Summary of Findings',
    vulnerabilities: 'Vulnerabilities',
    reconResults: 'Reconnaissance Results',
    severity: 'Severity',
    status: 'Status',
    finding: 'Finding',
    matchedAt: 'Matched at',
    endpoints: 'Endpoints',
    openPorts: 'Open ports',
    riskScore: 'Risk score',
    iocTitle: 'Indicators of Compromise',
    cveTitle: 'CVE Highlights',
    breachTitle: 'Data Breach & Exposure',
    recommendations: 'Recommended Actions',
    endOfReport: 'End of report',
    none: 'None',
    classification: 'Classification',
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    info: 'Info',
    tableOfContents: 'Table of Contents',
    generalRecommendations: 'General Recommendations',
    findingsOverview: 'Findings Overview',
    subdomainInventory: 'Subdomain Inventory',
    vulnerabilitySummary: 'Vulnerability Summary',
    identifiedVulnerabilities: 'Identified Vulnerabilities',
    documentClassification: 'Document Classification',
    aboutAssessment: 'About this assessment',
    affectedUrls: 'Affected URLs',
    severityDistribution: 'Severity Distribution',
    bySeverity: 'by Severity',
    byType: 'by Type',
    byHttpStatus: 'by HTTP status',
    description: 'Description',
    impact: 'Impact',
    remediation: 'Remediation',
    location: 'Location',
    vulnerabilityName: 'Vulnerability',
    count: 'Count',
    subdomain: 'Subdomain',
    noResponse: 'No response',
    subdomainsDiscovered: 'Subdomains discovered',
    totalVulnerabilities: 'Total vulnerabilities',
    vulnerabilityTypes: 'Vulnerability types',
    activeFindings: 'Active findings',
    findingsWord: 'Findings',
    securityAssessment: 'Security Assessment',
    threatIntelligence: 'Cyber Threat Intelligence',
    overview: 'Overview',
    signOff: 'Sign-off',
    confidential: 'Confidential',
  },
  id: {
    vaTitle: 'Laporan Vulnerability Assessment',
    tiTitle: 'Laporan Cyber Threat Intelligence',
    reportDate: 'Tanggal laporan',
    documentNumber: 'Nomor dokumen',
    project: 'Proyek',
    preparedBy: 'Disusun Oleh',
    reviewedBy: 'Diketahui Oleh',
    approvedBy: 'Disahkan Oleh',
    approvalSheet: 'Lembar Pengesahan',
    executiveSummary: 'Ringkasan Eksekutif',
    scope: 'Ruang Lingkup & Waktu',
    summaryOfFindings: 'Ringkasan Temuan',
    vulnerabilities: 'Kerentanan',
    reconResults: 'Hasil Reconnaissance',
    severity: 'Tingkat',
    status: 'Status',
    finding: 'Temuan',
    matchedAt: 'Terdeteksi di',
    endpoints: 'Endpoint',
    openPorts: 'Port terbuka',
    riskScore: 'Skor risiko',
    iocTitle: 'Indikator Kompromi',
    cveTitle: 'Sorotan CVE',
    breachTitle: 'Kebocoran Data & Eksposur',
    recommendations: 'Rekomendasi Tindakan',
    endOfReport: 'Akhir laporan',
    none: 'Tidak ada',
    classification: 'Klasifikasi',
    critical: 'Kritis',
    high: 'Tinggi',
    medium: 'Sedang',
    low: 'Rendah',
    info: 'Info',
    tableOfContents: 'Daftar Isi',
    generalRecommendations: 'Rekomendasi Umum',
    findingsOverview: 'Ringkasan Temuan',
    subdomainInventory: 'Inventaris Subdomain',
    vulnerabilitySummary: 'Ringkasan Kerentanan',
    identifiedVulnerabilities: 'Kerentanan yang Ditemukan',
    documentClassification: 'Klasifikasi Dokumen',
    aboutAssessment: 'Tentang Penilaian',
    affectedUrls: 'URL Terdampak',
    severityDistribution: 'Distribusi Tingkat Keparahan',
    bySeverity: 'menurut Keparahan',
    byType: 'menurut Jenis',
    byHttpStatus: 'menurut Status HTTP',
    description: 'Deskripsi',
    impact: 'Dampak',
    remediation: 'Remediasi',
    location: 'Lokasi',
    vulnerabilityName: 'Nama Kerentanan',
    count: 'Jumlah',
    subdomain: 'Subdomain',
    noResponse: 'Tidak ada respons',
    subdomainsDiscovered: 'Subdomain ditemukan',
    totalVulnerabilities: 'Total kerentanan',
    vulnerabilityTypes: 'Jenis kerentanan',
    activeFindings: 'Temuan aktif',
    findingsWord: 'Temuan',
    securityAssessment: 'Penilaian Keamanan',
    threatIntelligence: 'Cyber Threat Intelligence',
    overview: 'Ikhtisar',
    signOff: 'Pengesahan',
    confidential: 'Rahasia',
  },
} as const;

export type ReportLabels = Record<keyof (typeof dict)['en'], string>;

export function labels(lang: Lang): ReportLabels {
  return (dict[lang] ?? dict.en) as ReportLabels;
}

type Key = keyof (typeof dict)['en'];
/** "Primary / Secondary" bilingual label, ordered by the report's primary language. */
export function bi(lang: Lang, key: Key): string {
  return lang === 'id' ? `${dict.id[key]} / ${dict.en[key]}` : `${dict.en[key]} / ${dict.id[key]}`;
}
/** Free-text bilingual pair (no dictionary key). */
/**
 * A label/heading in the SELECTED language only. Reports are single-language documents (a separate EN
 * report and ID report, chosen via ?lang=), so labels are no longer stacked "English / Indonesia".
 */
export function biText(lang: Lang, idStr: string, enStr: string): string {
  return lang === 'id' ? idStr : enStr;
}
/** Primary-language value for a key. */
export function pri(lang: Lang, key: Key): string {
  return dict[lang][key];
}
/** Secondary-language value for a key. */
export function sec(lang: Lang, key: Key): string {
  return dict[lang === 'id' ? 'en' : 'id'][key];
}
