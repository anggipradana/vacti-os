import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { projects } from './schema';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const reportSettings = pgTable(
  'report_settings',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('va'), // va | ti
    primaryColor: text('primary_color').notNull().default('#069ec6'),
    secondaryColor: text('secondary_color').notNull().default('#08222b'),
    companyName: text('company_name'),
    companyAddress: text('company_address'),
    companyEmail: text('company_email'),
    companyWebsite: text('company_website'),
    documentNumber: text('document_number'),
    classification: text('classification'),
    footerText: text('footer_text'),
    language: text('language').notNull().default('en'),
    // Company logo embedded on the cover, stored as a data: URL (no object storage needed).
    companyLogo: text('company_logo'),
    // Optional analyst-authored executive summary (overrides the auto-generated one).
    showExecutiveSummary: boolean('show_executive_summary').notNull().default(false),
    executiveSummary: text('executive_summary'),
    executiveSummaryId: text('executive_summary_id'),
    createdAt: createdAt(),
  },
  (t) => ({ uniqKind: uniqueIndex('report_settings_project_kind_uniq').on(t.projectId, t.kind) }),
);

export const reportSignatories = pgTable('report_signatories', {
  id: id(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // prepared | reviewed | approved
  name: text('name').notNull(),
  position: text('position').notNull().default(''),
  // Optional signature image embedded on the approval sheet, stored as a data: URL.
  signatureImage: text('signature_image'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

export const reportsSchema = { reportSettings, reportSignatories };
