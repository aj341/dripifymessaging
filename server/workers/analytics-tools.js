// GA4 and Search Console, read-only, for Ricky and Tom.
//
// These tools are the only legitimate origin of any traffic, impression, click
// or query number the hive states. They fail honestly: not connected, scope not
// granted, or property not selected all come back as plain statements, never as
// a number. The first call after AJ re-consents is get_analytics_status — it
// discovers what is actually reachable and stores the property/site to use.
import {
  googleConnected,
  grantedScopes,
  analyticsGranted,
  searchConsoleGranted,
  ga4Properties,
  ga4RunReport,
  gscSites,
  gscQuery,
} from '../google.js';
import { getSetting, setSetting } from '../brain.js';

const NOT_CONNECTED =
  'Google is not connected (or was connected before the analytics scopes existed). AJ needs to visit ' +
  '/auth/google once and consent — the request now asks for Drive, GA4 and Search Console, all read-only. ' +
  'Until then, no analytics number exists: keep your reasoning qualitative and say so.';

// Sessions arriving from AI assistants — the pack's "AI Search" channel.
const AI_SOURCES = ['perplexity.ai', 'chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com'];

function fmtRows(rows, dims, mets) {
  return rows
    .map((r) => {
      const d = (r.dimensionValues || []).map((v) => v.value).join(' · ');
      const m = (r.metricValues || []).map((v, i) => `${mets[i]}=${v.value}`).join(', ');
      return `• ${d} — ${m}`;
    })
    .join('\n');
}

// DataForSEO: metered keyword-volume API, basic-auth via env vars. The ONLY
// legitimate source of a search-volume number in the entire hive.
const DFS_LOGIN = process.env.DATAFORSEO_LOGIN;
const DFS_PASSWORD = process.env.DATAFORSEO_PASSWORD;
function dataForSeoConfigured() {
  return Boolean(DFS_LOGIN && DFS_PASSWORD);
}

export const tools = [
  {
    name: 'keyword_volume',
    description:
      'Real Google search volumes for up to 20 keywords (Australia by default) via the DataForSEO API — ' +
      'the ONLY place a search-volume number may come from. Each call costs money, so batch keywords and ' +
      'call once per research pass, after you have mined the candidate phrasings, not while brainstorming. ' +
      'Cite results as "DataForSEO, Google Ads data". If the tool reports it is not configured, volumes do ' +
      'not exist — say so and stay qualitative.',
    input_schema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Up to 20 exact keyword phrases.',
        },
        location: {
          type: 'string',
          enum: ['Australia', 'United States', 'United Kingdom', 'New Zealand'],
          description: 'Market to measure. Default Australia — that is the market Design Bees competes in.',
        },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'get_analytics_status',
    description:
      'What analytics access actually exists right now: whether Google is connected, which scopes AJ ' +
      'granted, which GA4 properties and Search Console sites are reachable, and which are selected for ' +
      'queries. Call this FIRST in any analytics work — never assume access, and never quote a number ' +
      'if this says the source is not connected.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'select_analytics_property',
    description:
      'Store which GA4 property and/or Search Console site the hive queries by default. Use the exact ' +
      'values get_analytics_status listed. Only needs doing once, or when AJ says to switch.',
    input_schema: {
      type: 'object',
      properties: {
        ga4_property: { type: 'string', description: 'e.g. "properties/123456789", from get_analytics_status.' },
        gsc_site: { type: 'string', description: 'e.g. "sc-domain:designbees.com.au" or "https://designbees.com.au/", from get_analytics_status.' },
      },
    },
  },
  {
    name: 'gsc_search_analytics',
    description:
      'Query Search Console: real impressions, clicks, CTR and average position by query, page, country ' +
      'or device. This is where verified search demand comes from — question-format queries already ' +
      'earning impressions are pre-qualified topics, and post-publish this is the scoreboard for every ' +
      'blog post. Dates default to the last 28 days (GSC data lags ~2 days).',
    input_schema: {
      type: 'object',
      properties: {
        dimensions: {
          type: 'array',
          items: { type: 'string', enum: ['query', 'page', 'country', 'device', 'date'] },
          description: 'Default ["query"].',
        },
        start_date: { type: 'string', description: 'YYYY-MM-DD. Default 28 days ago.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD. Default yesterday.' },
        query_contains: { type: 'string', description: 'Only rows whose query contains this text, e.g. "how" for question-format queries.' },
        page_contains: { type: 'string', description: 'Only rows whose page URL contains this text, e.g. "/post/".' },
        row_limit: { type: 'integer', description: '1-500, default 50.' },
      },
    },
  },
  {
    name: 'ga4_report',
    description:
      'Run a GA4 report: sessions, users, conversions and engagement by channel, source, landing page or ' +
      'date. Set ai_search_only=true to filter to sessions arriving from AI assistants (' +
      AI_SOURCES.join(', ') +
      ') — the "AI Search" channel the blog engine measures itself by. Dates default to the last 28 days.',
    input_schema: {
      type: 'object',
      properties: {
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: 'GA4 metric names, e.g. ["sessions","totalUsers","conversions"]. Default ["sessions"].',
        },
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'GA4 dimension names, e.g. ["sessionSource"], ["landingPagePlusQueryString"], ["date"].',
        },
        start_date: { type: 'string', description: 'YYYY-MM-DD or GA4 relative ("28daysAgo"). Default 28daysAgo.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD or "today". Default today.' },
        ai_search_only: { type: 'boolean', description: 'Filter to sessions whose source is an AI assistant.' },
        limit: { type: 'integer', description: '1-250, default 50.' },
      },
    },
  },
];

export const handlers = {
  keyword_volume: async (input = {}) => {
    try {
      if (!dataForSeoConfigured()) {
        return (
          'Keyword volume is NOT available: DataForSEO is not configured (DATAFORSEO_LOGIN / ' +
          'DATAFORSEO_PASSWORD are not set on the Railway service). No search volume exists — stay ' +
          'qualitative and never estimate one.'
        );
      }
      const keywords = (Array.isArray(input.keywords) ? input.keywords : [])
        .map((k) => String(k || '').trim())
        .filter(Boolean)
        .slice(0, 20);
      if (!keywords.length) return 'No keywords given — pass up to 20 exact phrases.';
      const location = input.location || 'Australia';

      const res = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${DFS_LOGIN}:${DFS_PASSWORD}`).toString('base64'),
          'content-type': 'application/json',
        },
        body: JSON.stringify([{ keywords, location_name: location, language_name: 'English' }]),
      });
      const data = await res.json();
      if (!res.ok || data.status_code >= 40000) {
        return `DataForSEO error ${data.status_code || res.status}: ${data.status_message || 'request failed'}. No volume data this run — stay qualitative.`;
      }
      const task = data.tasks?.[0];
      if (task?.status_code >= 40000) {
        return `DataForSEO task error ${task.status_code}: ${task.status_message}. No volume data this run — stay qualitative.`;
      }
      const rows = task?.result || [];
      if (!rows.length) return `DataForSEO returned no rows for those keywords in ${location}. That is citable: no measurable volume recorded.`;

      const lines = rows.map((r) => {
        const vol = r.search_volume == null ? 'no data' : r.search_volume;
        const comp = r.competition == null ? '' : `, competition=${r.competition}`;
        const cpc = r.cpc == null ? '' : `, cpc=$${r.cpc}`;
        return `• "${r.keyword}" — volume=${vol}/mo (${location})${comp}${cpc}`;
      });
      return (
        `DataForSEO Google Ads data, ${location} — cite every figure as "DataForSEO":\n${lines.join('\n')}\n\n` +
        `"no data" means Google reports nothing for that phrase — citable as such, not as zero interest in the topic ` +
        `(question-form long-tails often show no data while the head term carries the volume).`
      );
    } catch (e) {
      return `keyword_volume failed: ${e.message}. No volume data this run — stay qualitative.`;
    }
  },

  get_analytics_status: async () => {
    try {
      if (!(await googleConnected())) return NOT_CONNECTED;
      const scopes = await grantedScopes();
      const lines = [`Google connected. Granted scopes: ${scopes || '(recorded before scope tracking — re-consent at /auth/google to refresh)'}`];

      if (await analyticsGranted()) {
        try {
          const props = await ga4Properties();
          const chosen = await getSetting('ga4_property');
          lines.push(
            props.length
              ? `GA4 properties visible:\n${props.map((p) => `  • ${p.property} — ${p.displayName} (${p.account})${p.property === chosen ? '  [SELECTED]' : ''}`).join('\n')}`
              : 'GA4 scope granted but no properties are visible to this Google account.'
          );
          if (!chosen && props.length) lines.push('No GA4 property selected yet — call select_analytics_property.');
        } catch (e) {
          lines.push(`GA4 scope granted but the API call failed: ${e.message}`);
        }
      } else {
        lines.push('GA4 scope NOT granted. AJ needs to re-consent at /auth/google. No GA4 number exists until then.');
      }

      if (await searchConsoleGranted()) {
        try {
          const sites = await gscSites();
          const chosen = await getSetting('gsc_site');
          lines.push(
            sites.length
              ? `Search Console sites:\n${sites.map((s) => `  • ${s.siteUrl} (${s.permissionLevel})${s.siteUrl === chosen ? '  [SELECTED]' : ''}`).join('\n')}`
              : 'Search Console scope granted but no verified sites are visible. The site-wide designbees.com.au property may still be pending DNS verification — only AJ can complete that in Search Console.'
          );
          if (!chosen && sites.length) lines.push('No GSC site selected yet — call select_analytics_property.');
        } catch (e) {
          lines.push(`Search Console scope granted but the API call failed: ${e.message}`);
        }
      } else {
        lines.push('Search Console scope NOT granted. AJ needs to re-consent at /auth/google. No GSC number exists until then.');
      }

      lines.push(
        dataForSeoConfigured()
          ? 'Keyword volumes: DataForSEO is configured — the keyword_volume tool is the only legitimate source of a volume figure.'
          : 'Keyword volumes: DataForSEO is NOT configured — never state a search volume or difficulty.'
      );
      return lines.join('\n\n');
    } catch (e) {
      return `Status check failed: ${e.message}. Treat analytics as unavailable and stay qualitative.`;
    }
  },

  select_analytics_property: async (input = {}) => {
    try {
      const out = [];
      if (input.ga4_property) {
        if (!/^properties\/\d+$/.test(String(input.ga4_property))) {
          return 'REJECTED — ga4_property must look like "properties/123456789", exactly as get_analytics_status listed it.';
        }
        await setSetting('ga4_property', String(input.ga4_property));
        out.push(`GA4 property set to ${input.ga4_property}.`);
      }
      if (input.gsc_site) {
        await setSetting('gsc_site', String(input.gsc_site));
        out.push(`Search Console site set to ${input.gsc_site}.`);
      }
      return out.length ? out.join(' ') : 'Nothing given — pass ga4_property and/or gsc_site from get_analytics_status.';
    } catch (e) {
      return `Could not store the selection: ${e.message}`;
    }
  },

  gsc_search_analytics: async (input = {}) => {
    try {
      if (!(await googleConnected())) return NOT_CONNECTED;
      if (!(await searchConsoleGranted())) {
        return 'Search Console scope not granted — AJ re-consents at /auth/google first. No GSC data exists until then.';
      }
      const dimensions = Array.isArray(input.dimensions) && input.dimensions.length ? input.dimensions : ['query'];
      const filters = [];
      if (input.query_contains) {
        filters.push({ dimension: 'query', operator: 'contains', expression: String(input.query_contains) });
      }
      if (input.page_contains) {
        filters.push({ dimension: 'page', operator: 'contains', expression: String(input.page_contains) });
      }
      const { site, rows } = await gscQuery({
        startDate: input.start_date,
        endDate: input.end_date,
        dimensions,
        rowLimit: input.row_limit,
        dimensionFilterGroups: filters.length ? [{ filters }] : undefined,
      });
      if (!rows.length) {
        return `Search Console (${site}) returned ZERO rows for that window/filter. That is a real, citable fact — the property has no recorded impressions there. Do not soften it and do not substitute an estimate.`;
      }
      const body = rows
        .map((r) => `• ${(r.keys || []).join(' · ')} — impressions=${r.impressions}, clicks=${r.clicks}, ctr=${(r.ctr * 100).toFixed(1)}%, position=${r.position.toFixed(1)}`)
        .join('\n');
      return `Search Console ${site} (${dimensions.join('+')}, ${rows.length} rows) — cite as "GSC, ${input.start_date || 'last 28 days'}":\n${body}`;
    } catch (e) {
      return `GSC query failed: ${e.message}. No data — stay qualitative rather than estimating.`;
    }
  },

  ga4_report: async (input = {}) => {
    try {
      if (!(await googleConnected())) return NOT_CONNECTED;
      if (!(await analyticsGranted())) {
        return 'GA4 scope not granted — AJ re-consents at /auth/google first. No GA4 number exists until then.';
      }
      const metrics = Array.isArray(input.metrics) && input.metrics.length ? input.metrics : ['sessions'];
      const dimensions = Array.isArray(input.dimensions) ? input.dimensions : [];
      let dimensionFilter;
      if (input.ai_search_only) {
        if (!dimensions.includes('sessionSource')) dimensions.push('sessionSource');
        dimensionFilter = {
          filter: {
            fieldName: 'sessionSource',
            inListFilter: { values: AI_SOURCES },
          },
        };
      }
      const data = await ga4RunReport({
        dimensions,
        metrics,
        startDate: input.start_date,
        endDate: input.end_date,
        dimensionFilter,
        limit: input.limit,
      });
      const rows = data.rows || [];
      if (!rows.length) {
        return `GA4 returned ZERO rows${input.ai_search_only ? ' for AI-assistant sources' : ''} in that window. That is a real, citable fact. Do not substitute an estimate.`;
      }
      return (
        `GA4 (${metrics.join(', ')}${dimensions.length ? ` by ${dimensions.join('+')}` : ''}${input.ai_search_only ? ', AI sources only' : ''}, ${rows.length} rows) — cite as "GA4, ${input.start_date || 'last 28 days'}":\n` +
        fmtRows(rows, dimensions, metrics)
      );
    } catch (e) {
      return `GA4 query failed: ${e.message}. No data — stay qualitative rather than estimating.`;
    }
  },
};
