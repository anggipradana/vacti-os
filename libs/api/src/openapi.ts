/** Hand-authored OpenAPI 3.1 document for the public REST API. Served at /api/openapi.json. */
export function openApiSpec(): Record<string, unknown> {
  const bearer = [{ bearerAuth: [] }];
  const json = (schema: unknown) => ({ content: { 'application/json': { schema } } });
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
  const projectId = { name: 'projectId', in: 'query', schema: { type: 'string', format: 'uuid' } };

  // Standard responses reused across endpoints.
  const unauthorized = { description: 'Missing or invalid bearer token', ...json(ref('Error')) };
  const forbidden = { description: 'Role lacks the required permission', ...json(ref('Error')) };
  const notFound = { description: 'Not found', ...json(ref('Error')) };
  const badRequest = { description: 'Invalid payload', ...json(ref('Error')) };
  const conflict = {
    description: 'Conflicts with an invariant (duplicate / self / last SysAdmin)',
    ...json(ref('Error')),
  };
  // Common `{ ok: true }` / `{ status: 'deleted' }` style success bodies.
  const okBody = { type: 'object', properties: { ok: { type: 'boolean' } } };
  const deletedOk = { description: 'Deleted', ...json(okBody) };
  const deletedStatus = {
    description: 'Deleted',
    ...json({ type: 'object', properties: { status: { type: 'string', example: 'deleted' } } }),
  };
  // Bulk triage status: `{ ids: [...], status }` → `{ ok: true }`.
  const bulkStatusBody = {
    required: true,
    ...json({
      type: 'object',
      required: ['ids', 'status'],
      properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, status: { type: 'string' } },
    }),
  };
  const noteBody = {
    required: true,
    ...json({ type: 'object', properties: { note: { type: 'string', nullable: true } } }),
  };
  const statusBody = {
    required: true,
    ...json({ type: 'object', required: ['status'], properties: { status: { type: 'string' } } }),
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'vacti API',
      version: '0.1.0',
      description:
        'Recon (Vulnerability Assessment) + Threat Intelligence REST API.\n\n' +
        '**Auth:** every endpoint except `/api/health`, `/api/openapi.json` and `/api/docs` requires a ' +
        'Bearer **API token** (`Authorization: Bearer vct_…`), created under Settings → API tokens.\n\n' +
        '**RBAC:** mutating endpoints are gated by the token owner’s role (SysAdmin / PenetrationTester / ' +
        'Auditor); a disallowed action returns `403`.',
    },
    servers: [{ url: '/', description: 'Same origin' }],
    security: bearer,
    tags: [
      { name: 'System' },
      { name: 'Projects' },
      { name: 'Targets' },
      { name: 'Scans' },
      { name: 'Schedules' },
      { name: 'Threat Intel' },
      { name: 'Attack Surface' },
      { name: 'Webhooks' },
      { name: 'Users' },
      { name: 'Tokens' },
      { name: 'Search' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'API token (vct_…)' },
      },
      schemas: {
        Error: { type: 'object', properties: { error: {} }, required: ['error'] },
        Target: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            domain: { type: 'string' },
            predefinedSubdomains: { type: 'array', items: { type: 'string' } },
            customHeaders: { type: 'object', additionalProperties: { type: 'string' }, nullable: true },
          },
        },
        CreateTarget: {
          type: 'object',
          required: ['projectId', 'domain'],
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            domain: { type: 'string' },
            predefinedSubdomains: { type: 'array', items: { type: 'string' } },
          },
        },
        ScanProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            tools: {
              type: 'object',
              properties: {
                subfinder: { type: 'boolean' },
                httpx: { type: 'boolean' },
                naabu: { type: 'boolean' },
                nuclei: { type: 'boolean' },
                wordfence: { type: 'boolean' },
              },
            },
            ports: { type: 'string', example: 'top-100' },
            severities: { type: 'array', items: { type: 'string' } },
          },
        },
        Scan: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            targetId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
            stage: { type: 'string', nullable: true },
            counts: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Vulnerability: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            severity: { type: 'integer', description: '0=info … 4=critical' },
            status: { type: 'string' },
            cvss: { type: 'number', nullable: true },
            cveIds: { type: 'array', items: { type: 'string' } },
            url: { type: 'string', nullable: true },
          },
        },
        ScanDiff: {
          type: 'object',
          properties: {
            baseline: { type: 'string', format: 'uuid' },
            current: { type: 'string', format: 'uuid' },
            diff: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  added: { type: 'array', items: { type: 'string' } },
                  removed: { type: 'array', items: { type: 'string' } },
                  unchanged: { type: 'integer' },
                },
              },
            },
          },
        },
        Schedule: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            targetId: { type: 'string', format: 'uuid' },
            profileId: { type: 'string', format: 'uuid', nullable: true },
            cron: { type: 'string', example: '0 2 * * *' },
            enabled: { type: 'boolean' },
            lastRunAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Indicator: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['domain', 'subdomain', 'ip'] },
            value: { type: 'string' },
            note: { type: 'string', nullable: true },
          },
        },
        Webhook: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            channel: { type: 'string', enum: ['discord', 'slack', 'telegram', 'google_chat', 'generic'] },
            label: { type: 'string', nullable: true },
            url: { type: 'string', nullable: true },
            events: { type: 'array', items: { type: 'string' } },
            enabled: { type: 'boolean' },
          },
        },
        SearchResults: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            hits: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kind: {
                    type: 'string',
                    enum: ['project', 'target', 'scan', 'subdomain', 'endpoint', 'vulnerability'],
                  },
                  id: { type: 'string' },
                  label: { type: 'string' },
                  href: { type: 'string' },
                },
              },
            },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            slug: { type: 'string' },
            name: { type: 'string' },
            sector: { type: 'string', description: 'SectorName for the threat-news feed' },
            isDefault: { type: 'boolean' },
            brandQuery: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['SysAdmin', 'PenetrationTester', 'Auditor'] },
          },
        },
        ApiToken: {
          type: 'object',
          description: 'API-token metadata. The secret value is never returned by list/read.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            label: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreatedApiToken: {
          type: 'object',
          description: 'Returned ONCE on creation; the plaintext token is never stored or shown again.',
          properties: {
            token: { type: 'string', description: 'Plaintext API token (vct_…) - copy it now.' },
            id: { type: 'string', format: 'uuid' },
            label: { type: 'string' },
          },
        },
        Leak: {
          type: 'object',
          description: 'Leaked-credential record. identifier/password are CONFIDENTIAL PII.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            domain: { type: 'string' },
            source: { type: 'string', nullable: true },
            identifier: { type: 'string', nullable: true },
            origin: { type: 'string', nullable: true },
            type: { type: 'string', enum: ['domain', 'origin'] },
            checked: { type: 'boolean' },
            status: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        DiscoveredUrl: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            targetId: { type: 'string', format: 'uuid', nullable: true },
            scanId: { type: 'string', format: 'uuid', nullable: true },
            host: { type: 'string', nullable: true },
            urlText: { type: 'string' },
            sources: { type: 'array', items: { type: 'string', enum: ['virustotal', 'wayback'] } },
            pathnameExtension: { type: 'string', nullable: true },
            categorySlug: { type: 'string', nullable: true },
            deepScanState: {
              type: 'string',
              enum: ['skipped', 'pending', 'done', 'failed', 'blocked'],
            },
            httpStatus: { type: 'integer', nullable: true },
            contentLength: { type: 'integer', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ExposureFinding: {
          type: 'object',
          description: 'Secret/credential pattern matched in a URL or fetched body. snippet is CONFIDENTIAL.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            discoveredUrlId: { type: 'string', format: 'uuid', nullable: true },
            scanId: { type: 'string', format: 'uuid', nullable: true },
            source: { type: 'string', enum: ['url', 'body'] },
            findingType: { type: 'string' },
            snippet: { type: 'string', nullable: true, description: 'CONFIDENTIAL - masked in UI' },
            urlText: { type: 'string', nullable: true },
            status: { type: 'string' },
            analystNote: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        IpResolution: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            ipAddress: { type: 'string' },
            latestResolvedAt: { type: 'string', format: 'date-time' },
            hostnameCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        News: {
          type: 'object',
          description: 'Per-sector threat headline (RSS), triageable.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sector: { type: 'string' },
            title: { type: 'string' },
            link: { type: 'string' },
            source: { type: 'string' },
            summary: { type: 'string', nullable: true },
            publishedAt: { type: 'string', format: 'date-time', nullable: true },
            status: { type: 'string' },
          },
        },
        BrandNews: {
          type: 'object',
          description: 'Per-project brand-monitoring headline, triageable.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            link: { type: 'string' },
            source: { type: 'string' },
            summary: { type: 'string', nullable: true },
            publishedAt: { type: 'string', format: 'date-time', nullable: true },
            security: { type: 'boolean' },
            status: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/api/health': {
        get: {
          summary: 'Health check (public)',
          tags: ['System'],
          security: [],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { status: { type: 'string', example: 'ok' } } }),
            },
          },
        },
      },
      '/api/openapi.json': {
        get: {
          summary: 'This OpenAPI document (public)',
          tags: ['System'],
          security: [],
          responses: { '200': { description: 'OK', ...json({ type: 'object', additionalProperties: true }) } },
        },
      },
      '/api/docs': {
        get: {
          summary: 'Redoc API documentation UI (public)',
          tags: ['System'],
          security: [],
          responses: { '200': { description: 'HTML documentation page' } },
        },
      },
      '/api/whoami': {
        get: {
          summary: 'Current principal',
          tags: ['System'],
          security: bearer,
          responses: {
            '200': {
              description: 'OK',
              ...json({
                type: 'object',
                properties: {
                  userId: { type: 'string', format: 'uuid' },
                  email: { type: 'string', format: 'email', nullable: true },
                },
              }),
            },
            '401': unauthorized,
          },
        },
      },
      '/api/search': {
        get: {
          summary: 'Universal search across resources',
          tags: ['Search'],
          security: bearer,
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK', ...json(ref('SearchResults')) }, '401': unauthorized },
        },
      },
      '/api/targets': {
        get: {
          summary: 'List targets',
          tags: ['Targets'],
          security: bearer,
          parameters: [projectId],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { targets: { type: 'array', items: ref('Target') } } }),
            },
            '401': unauthorized,
          },
        },
        post: {
          summary: 'Create a target',
          tags: ['Targets'],
          security: bearer,
          requestBody: { required: true, ...json(ref('CreateTarget')) },
          responses: {
            '201': { description: 'Created', ...json({ type: 'object', properties: { target: ref('Target') } }) },
            '400': badRequest,
            '401': unauthorized,
            '403': forbidden,
          },
        },
      },
      '/api/profiles': {
        get: {
          summary: 'List scan profiles',
          tags: ['Scans'],
          security: bearer,
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { profiles: { type: 'array', items: ref('ScanProfile') } } }),
            },
            '401': unauthorized,
          },
        },
        post: {
          summary: 'Create a scan profile',
          tags: ['Scans'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['name', 'tools'],
              properties: {
                projectId: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                tools: {
                  type: 'object',
                  properties: {
                    subfinder: { type: 'boolean' },
                    httpx: { type: 'boolean' },
                    naabu: { type: 'boolean' },
                    nuclei: { type: 'boolean' },
                    wordfence: { type: 'boolean' },
                  },
                },
                ports: { type: 'string', default: 'top-100' },
                severities: { type: 'array', items: { type: 'string' } },
              },
            }),
          },
          responses: {
            '201': { description: 'Created', ...json({ type: 'object', properties: { profile: ref('ScanProfile') } }) },
            '400': badRequest,
            '403': forbidden,
          },
        },
      },
      '/api/profiles/{id}': {
        patch: {
          summary: 'Update a scan profile',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                tools: {
                  type: 'object',
                  properties: {
                    subfinder: { type: 'boolean' },
                    httpx: { type: 'boolean' },
                    naabu: { type: 'boolean' },
                    nuclei: { type: 'boolean' },
                    wordfence: { type: 'boolean' },
                  },
                },
                ports: { type: 'string' },
                severities: { type: 'array', items: { type: 'string' } },
                rate: { type: 'number', nullable: true },
                config: { type: 'object', nullable: true, additionalProperties: true },
              },
            }),
          },
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { profile: ref('ScanProfile') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
        delete: {
          summary: 'Delete a scan profile',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedOk, '403': forbidden },
        },
      },
      '/api/scans': {
        get: {
          summary: 'List scans (paginated)',
          tags: ['Scans'],
          security: bearer,
          parameters: [
            projectId,
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, minimum: 1, maximum: 100 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': {
              description: 'OK',
              ...json({
                type: 'object',
                properties: {
                  scans: { type: 'array', items: ref('Scan') },
                  total: { type: 'integer' },
                  limit: { type: 'integer' },
                  offset: { type: 'integer' },
                },
              }),
            },
            '401': unauthorized,
          },
        },
        post: {
          summary: 'Start a scan (enqueue)',
          tags: ['Scans'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['targetId'],
              properties: {
                targetId: { type: 'string', format: 'uuid' },
                profileId: { type: 'string', format: 'uuid' },
                mode: { type: 'string', enum: ['active', 'passive', 'full'] },
                deepScan: { type: 'boolean' },
              },
            }),
          },
          responses: {
            '202': { description: 'Queued', ...json({ type: 'object', properties: { scan: ref('Scan') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/scans/{id}': {
        get: {
          summary: 'Scan status + activity',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          responses: {
            '200': {
              description: 'OK',
              ...json({
                type: 'object',
                properties: {
                  scan: ref('Scan'),
                  activity: { type: 'array', items: { type: 'object', additionalProperties: true } },
                },
              }),
            },
            '404': notFound,
          },
        },
        delete: {
          summary: 'Delete a scan (cascades activity/results)',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedOk, '403': forbidden },
        },
      },
      '/api/scans/{id}/results': {
        get: {
          summary: 'Scan results (subdomains/endpoints/ports/vulns)',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          responses: {
            '200': {
              description: 'OK',
              ...json({
                type: 'object',
                properties: {
                  subdomains: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  endpoints: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  ports: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  vulnerabilities: { type: 'array', items: ref('Vulnerability') },
                },
              }),
            },
            '404': notFound,
          },
        },
      },
      '/api/scans/{id}/events': {
        get: {
          summary: 'Scan progress (Server-Sent Events)',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': { description: 'text/event-stream' } },
        },
      },
      '/api/scans/{id}/cancel': {
        post: {
          summary: 'Cancel a running/queued scan',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          responses: {
            '200': {
              description: 'Cancelled / terminal',
              ...json({ type: 'object', properties: { scan: ref('Scan') } }),
            },
            '202': {
              description: 'Cancellation requested',
              ...json({ type: 'object', properties: { scan: ref('Scan') } }),
            },
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/scans/{id}/diff': {
        get: {
          summary: 'Diff this scan against another',
          tags: ['Scans'],
          security: bearer,
          parameters: [
            idParam,
            { name: 'against', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { '200': { description: 'OK', ...json(ref('ScanDiff')) }, '400': badRequest, '404': notFound },
        },
      },
      '/api/vulnerabilities/{id}/status': {
        post: {
          summary: 'Set vulnerability triage status',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['status'],
              properties: { status: { type: 'string' }, note: { type: 'string' } },
            }),
          },
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { vulnerability: ref('Vulnerability') } }),
            },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/schedules': {
        get: {
          summary: 'List scan schedules',
          tags: ['Schedules'],
          security: bearer,
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { schedules: { type: 'array', items: ref('Schedule') } } }),
            },
            '401': unauthorized,
          },
        },
        post: {
          summary: 'Create a scan schedule',
          tags: ['Schedules'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['targetId', 'cron'],
              properties: {
                targetId: { type: 'string', format: 'uuid' },
                cron: { type: 'string' },
                profileId: { type: 'string', format: 'uuid' },
              },
            }),
          },
          responses: {
            '201': { description: 'Created', ...json({ type: 'object', properties: { schedule: ref('Schedule') } }) },
            '400': badRequest,
            '403': forbidden,
          },
        },
      },
      '/api/schedules/{id}': {
        patch: {
          summary: 'Update a scan schedule',
          tags: ['Schedules'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['cron'],
              properties: {
                cron: { type: 'string' },
                profileId: { type: 'string', format: 'uuid', nullable: true },
                enabled: { type: 'boolean' },
              },
            }),
          },
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { schedule: ref('Schedule') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
        delete: {
          summary: 'Delete a scan schedule',
          tags: ['Schedules'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedStatus, '403': forbidden },
        },
      },
      '/api/schedules/{id}/toggle': {
        post: {
          summary: 'Toggle a scan schedule enabled flag',
          tags: ['Schedules'],
          security: bearer,
          parameters: [idParam],
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { schedule: ref('Schedule') } }) },
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/threat-intel': {
        get: {
          summary: 'Threat-intel data + unified risk score',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [{ ...projectId, required: true }],
          responses: {
            '200': {
              description: 'OK',
              ...json({
                type: 'object',
                properties: {
                  risk: { type: 'object', additionalProperties: true, description: 'Unified project risk score' },
                  otx: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  leaks: { type: 'array', items: ref('Leak') },
                  indicators: { type: 'array', items: ref('Indicator') },
                  status: { type: 'object', additionalProperties: true, nullable: true },
                },
              }),
            },
            '400': badRequest,
          },
        },
      },
      '/api/threat-intel/refresh': {
        post: {
          summary: 'Enqueue a threat-intel refresh',
          tags: ['Threat Intel'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['projectId'],
              properties: { projectId: { type: 'string', format: 'uuid' } },
            }),
          },
          responses: {
            '202': { description: 'Queued', ...json({ type: 'object', properties: { status: { type: 'string' } } }) },
            '400': badRequest,
            '403': forbidden,
          },
        },
      },
      '/api/threat-intel/brand-refresh': {
        post: {
          summary: 'Enqueue a brand-monitoring refresh',
          tags: ['Threat Intel'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['projectId'],
              properties: { projectId: { type: 'string', format: 'uuid' } },
            }),
          },
          responses: {
            '202': { description: 'Queued', ...json({ type: 'object', properties: { status: { type: 'string' } } }) },
            '400': badRequest,
            '403': forbidden,
          },
        },
      },
      '/api/indicators': {
        get: {
          summary: 'List manual indicators',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [projectId],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { indicators: { type: 'array', items: ref('Indicator') } } }),
            },
          },
        },
        post: {
          summary: 'Add a manual indicator',
          tags: ['Threat Intel'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['projectId', 'type', 'value'],
              properties: {
                projectId: { type: 'string', format: 'uuid' },
                type: { type: 'string', enum: ['domain', 'subdomain', 'ip'] },
                value: { type: 'string' },
                note: { type: 'string' },
              },
            }),
          },
          responses: {
            '201': { description: 'Created', ...json({ type: 'object', properties: { indicator: ref('Indicator') } }) },
            '400': badRequest,
            '403': forbidden,
          },
        },
      },
      '/api/indicators/{id}': {
        patch: {
          summary: 'Update a manual indicator',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['type', 'value'],
              properties: {
                type: { type: 'string', enum: ['domain', 'subdomain', 'ip'] },
                value: { type: 'string' },
                note: { type: 'string' },
              },
            }),
          },
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { indicator: ref('Indicator') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
        delete: {
          summary: 'Delete a manual indicator',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedStatus, '403': forbidden },
        },
      },
      '/api/leaks/{id}/status': {
        post: {
          summary: 'Set leak triage status',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [idParam],
          requestBody: statusBody,
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { leak: ref('Leak') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/leaks/{id}/toggle': {
        post: {
          summary: 'Toggle a leak checked flag',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [idParam],
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { leak: ref('Leak') } }) },
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/webhooks': {
        get: {
          summary: 'List webhooks',
          tags: ['Webhooks'],
          security: bearer,
          parameters: [projectId],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { webhooks: { type: 'array', items: ref('Webhook') } } }),
            },
          },
        },
        post: {
          summary: 'Create a webhook',
          tags: ['Webhooks'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['projectId', 'channel'],
              properties: {
                projectId: { type: 'string', format: 'uuid' },
                channel: { type: 'string', enum: ['discord', 'slack', 'telegram', 'google_chat', 'generic'] },
                label: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                telegramToken: { type: 'string' },
                telegramChatId: { type: 'string' },
                events: { type: 'array', items: { type: 'string' } },
                enabled: { type: 'boolean', default: true },
              },
            }),
          },
          responses: {
            '201': { description: 'Created', ...json({ type: 'object', properties: { webhook: ref('Webhook') } }) },
            '400': badRequest,
            '403': forbidden,
          },
        },
      },
      '/api/webhooks/{id}': {
        patch: {
          summary: 'Update a webhook',
          tags: ['Webhooks'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['channel'],
              properties: {
                channel: { type: 'string', enum: ['discord', 'slack', 'telegram', 'google_chat', 'generic'] },
                label: { type: 'string', nullable: true },
                url: { type: 'string', nullable: true },
                telegramToken: { type: 'string', nullable: true },
                telegramChatId: { type: 'string', nullable: true },
                events: { type: 'array', items: { type: 'string' } },
                enabled: { type: 'boolean' },
              },
            }),
          },
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { webhook: ref('Webhook') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
        delete: {
          summary: 'Delete a webhook',
          tags: ['Webhooks'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedStatus, '403': forbidden },
        },
      },
      '/api/webhooks/{id}/test': {
        post: {
          summary: 'Send a test notification',
          tags: ['Webhooks'],
          security: bearer,
          parameters: [idParam],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { result: { type: 'object', additionalProperties: true } } }),
            },
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/projects': {
        post: {
          summary: 'Create a project',
          tags: ['Projects'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['name', 'slug'],
              properties: {
                name: { type: 'string' },
                slug: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
              },
            }),
          },
          responses: {
            '201': { description: 'Created', ...json({ type: 'object', properties: { project: ref('Project') } }) },
            '400': badRequest,
            '403': forbidden,
          },
        },
      },
      '/api/projects/{id}': {
        patch: {
          summary: 'Update a project',
          tags: ['Projects'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['name', 'sector'],
              properties: {
                name: { type: 'string' },
                sector: { type: 'string' },
                slug: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
              },
            }),
          },
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { project: ref('Project') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
        delete: {
          summary: 'Delete a project (cascades targets/scans/findings)',
          tags: ['Projects'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedOk, '403': forbidden },
        },
      },
      '/api/projects/{id}/default': {
        post: {
          summary: 'Set a project as the default workspace',
          tags: ['Projects'],
          security: bearer,
          parameters: [idParam],
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { project: ref('Project') } }) },
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/targets/{id}': {
        patch: {
          summary: 'Update a target',
          tags: ['Targets'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['domain'],
              properties: {
                domain: { type: 'string' },
                predefinedSubdomains: { type: 'array', items: { type: 'string' } },
                customHeaders: { type: 'object', additionalProperties: { type: 'string' }, nullable: true },
              },
            }),
          },
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { target: ref('Target') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
        delete: {
          summary: 'Delete a target (cascades subdomains/endpoints/ports)',
          tags: ['Targets'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedOk, '403': forbidden },
        },
      },
      '/api/vulnerabilities/bulk/status': {
        post: {
          summary: 'Bulk-set vulnerability triage status',
          tags: ['Scans'],
          security: bearer,
          requestBody: bulkStatusBody,
          responses: { '200': { description: 'OK', ...json(okBody) }, '400': badRequest, '403': forbidden },
        },
      },
      '/api/vulnerabilities/{id}/note': {
        post: {
          summary: 'Set a vulnerability analyst note',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          requestBody: noteBody,
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { vulnerability: ref('Vulnerability') } }),
            },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/vulnerabilities/{id}': {
        delete: {
          summary: 'Delete a vulnerability finding',
          tags: ['Scans'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedOk, '403': forbidden },
        },
      },
      '/api/leaks/bulk/status': {
        post: {
          summary: 'Bulk-set leak triage status',
          tags: ['Threat Intel'],
          security: bearer,
          requestBody: bulkStatusBody,
          responses: { '200': { description: 'OK', ...json(okBody) }, '400': badRequest, '403': forbidden },
        },
      },
      '/api/leaks/{id}': {
        delete: {
          summary: 'Delete a leaked-credential record',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedOk, '403': forbidden },
        },
      },
      '/api/surface/findings/{id}': {
        delete: {
          summary: 'Delete an exposure finding',
          tags: ['Attack Surface'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedOk, '403': forbidden },
        },
      },
      '/api/users': {
        post: {
          summary: 'Create a user (SysAdmin only)',
          tags: ['Users'],
          security: bearer,
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['email', 'password', 'role'],
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 8 },
                role: { type: 'string', enum: ['SysAdmin', 'PenetrationTester', 'Auditor'] },
              },
            }),
          },
          responses: {
            '201': { description: 'Created', ...json(ref('User')) },
            '400': badRequest,
            '403': forbidden,
            '409': conflict,
          },
        },
      },
      '/api/users/{id}': {
        patch: {
          summary: "Change a user's role (SysAdmin only; protects last SysAdmin)",
          tags: ['Users'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['role'],
              properties: { role: { type: 'string', enum: ['SysAdmin', 'PenetrationTester', 'Auditor'] } },
            }),
          },
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { user: ref('User') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
            '409': conflict,
          },
        },
        delete: {
          summary: 'Delete a user (SysAdmin only; never self or last SysAdmin)',
          tags: ['Users'],
          security: bearer,
          parameters: [idParam],
          responses: {
            '200': deletedOk,
            '403': forbidden,
            '404': notFound,
            '409': conflict,
          },
        },
      },
      '/api/users/{id}/reset-password': {
        post: {
          summary: "Reset a user's password (SysAdmin only)",
          tags: ['Users'],
          security: bearer,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              required: ['password'],
              properties: { password: { type: 'string', minLength: 8 } },
            }),
          },
          responses: { '200': deletedOk, '400': badRequest, '403': forbidden, '404': notFound },
        },
      },
      '/api/tokens': {
        get: {
          summary: 'List your API tokens (metadata only)',
          tags: ['Tokens'],
          security: bearer,
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { tokens: { type: 'array', items: ref('ApiToken') } } }),
            },
            '401': unauthorized,
          },
        },
        post: {
          summary: 'Create an API token (plaintext returned once)',
          tags: ['Tokens'],
          security: bearer,
          requestBody: {
            required: false,
            ...json({ type: 'object', properties: { label: { type: 'string' } } }),
          },
          responses: {
            '201': { description: 'Created', ...json(ref('CreatedApiToken')) },
            '401': unauthorized,
          },
        },
      },
      '/api/tokens/{id}': {
        delete: {
          summary: 'Revoke one of your API tokens',
          tags: ['Tokens'],
          security: bearer,
          parameters: [idParam],
          responses: { '200': deletedOk, '401': unauthorized },
        },
      },
      '/api/surface/urls': {
        get: {
          summary: 'List discovered URLs for a project (paginated)',
          tags: ['Attack Surface'],
          security: bearer,
          parameters: [
            { ...projectId, required: true },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, minimum: 1, maximum: 500 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': {
              description: 'OK',
              ...json({
                type: 'object',
                properties: {
                  urls: { type: 'array', items: ref('DiscoveredUrl') },
                  total: { type: 'integer' },
                  limit: { type: 'integer' },
                  offset: { type: 'integer' },
                },
              }),
            },
            '400': badRequest,
          },
        },
      },
      '/api/surface/findings': {
        get: {
          summary: 'List exposure findings for a project',
          tags: ['Attack Surface'],
          security: bearer,
          parameters: [
            { ...projectId, required: true },
            { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Filter by findingType' },
          ],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { findings: { type: 'array', items: ref('ExposureFinding') } } }),
            },
            '400': badRequest,
          },
        },
      },
      '/api/surface/findings/bulk/status': {
        post: {
          summary: 'Bulk-set exposure-finding triage status',
          tags: ['Attack Surface'],
          security: bearer,
          requestBody: bulkStatusBody,
          responses: { '200': { description: 'OK', ...json(okBody) }, '400': badRequest, '403': forbidden },
        },
      },
      '/api/surface/findings/{id}/status': {
        post: {
          summary: 'Set an exposure-finding triage status',
          tags: ['Attack Surface'],
          security: bearer,
          parameters: [idParam],
          requestBody: statusBody,
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { finding: ref('ExposureFinding') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/surface/findings/{id}/note': {
        post: {
          summary: 'Set an exposure-finding analyst note',
          tags: ['Attack Surface'],
          security: bearer,
          parameters: [idParam],
          requestBody: noteBody,
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { finding: ref('ExposureFinding') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/surface/ips': {
        get: {
          summary: 'List passive-DNS IP resolutions for a project',
          tags: ['Attack Surface'],
          security: bearer,
          parameters: [{ ...projectId, required: true }],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { ips: { type: 'array', items: ref('IpResolution') } } }),
            },
            '400': badRequest,
          },
        },
      },
      '/api/news': {
        get: {
          summary: 'List sector threat-news headlines',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [{ name: 'sector', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { news: { type: 'array', items: ref('News') } } }),
            },
            '401': unauthorized,
          },
        },
      },
      '/api/news/bulk/status': {
        post: {
          summary: 'Bulk-set sector-news triage status',
          tags: ['Threat Intel'],
          security: bearer,
          requestBody: bulkStatusBody,
          responses: { '200': { description: 'OK', ...json(okBody) }, '400': badRequest, '403': forbidden },
        },
      },
      '/api/news/{id}/status': {
        post: {
          summary: 'Set a sector-news triage status',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [idParam],
          requestBody: statusBody,
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { news: ref('News') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
      },
      '/api/brand-news': {
        get: {
          summary: 'List brand-monitoring headlines for a project',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [projectId],
          responses: {
            '200': {
              description: 'OK',
              ...json({ type: 'object', properties: { news: { type: 'array', items: ref('BrandNews') } } }),
            },
            '401': unauthorized,
          },
        },
      },
      '/api/brand-news/bulk/status': {
        post: {
          summary: 'Bulk-set brand-news triage status',
          tags: ['Threat Intel'],
          security: bearer,
          requestBody: bulkStatusBody,
          responses: { '200': { description: 'OK', ...json(okBody) }, '400': badRequest, '403': forbidden },
        },
      },
      '/api/brand-news/{id}/status': {
        post: {
          summary: 'Set a brand-news triage status',
          tags: ['Threat Intel'],
          security: bearer,
          parameters: [idParam],
          requestBody: statusBody,
          responses: {
            '200': { description: 'OK', ...json({ type: 'object', properties: { news: ref('BrandNews') } }) },
            '400': badRequest,
            '403': forbidden,
            '404': notFound,
          },
        },
      },
    },
  };
}

export function redocHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>vacti API</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0}</style></head>
<body><redoc spec-url="/api/openapi.json"></redoc>
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script></body></html>`;
}
