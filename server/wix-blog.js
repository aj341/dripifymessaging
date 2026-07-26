// Publishing an approved draft to the Design Bees blog.
//
// Nothing in here runs on its own. AJ approves a draft on the dashboard, then
// presses Publish, and only then does anything reach Wix. The two steps are
// deliberately separate: approving is a judgement about the writing, publishing
// is a live change to the website.
//
// The body is converted to Wix rich content (Ricos) with explicit paragraph
// nodes. The operator pack calls this out because a plain-text body collapses
// its spacing on the live post and has to be rebuilt by hand.
import { wixApi } from './wix-oauth.js';

// From the blog engine operator pack.
const CATEGORY_IDS = {
  'Outsourcing Design': 'c8b497ec-97f8-4897-acc1-42769e4988cf',
  'Design Costs & Budgeting': '7b05afa1-e3f3-4e14-9cc8-a4809cdffd77',
  'Design Operations': 'baf159e1-105b-49aa-9169-09541949c584',
};
const AUTHOR_MEMBER_ID = 'b28d6c97-3735-4d9a-9313-447e4db61f52'; // AJ Kavanagh

let _id = 0;
const nodeId = () => `n${++_id}`;

/** Inline markdown (links and bold) to Ricos text nodes with decorations. */
function inlineNodes(text) {
  const out = [];
  // [label](url) and **bold** are the only inline forms the drafts use.
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(textNode(text.slice(last, m.index)));
    if (m[1]) out.push(textNode(m[1], [{ type: 'LINK', linkData: { link: { url: m[2], target: 'BLANK' } } }]));
    else out.push(textNode(m[3], [{ type: 'BOLD', fontWeightValue: 700 }]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(textNode(text.slice(last)));
  return out.length ? out : [textNode('')];
}

function textNode(text, decorations = []) {
  return { type: 'TEXT', id: '', nodes: [], textData: { text, decorations } };
}

function paragraph(text) {
  return {
    type: 'PARAGRAPH',
    id: nodeId(),
    nodes: inlineNodes(text),
    paragraphData: { textStyle: { textAlignment: 'AUTO' }, indentation: 0 },
  };
}

function heading(text, level) {
  return {
    type: 'HEADING',
    id: nodeId(),
    nodes: inlineNodes(text),
    headingData: { level, textStyle: { textAlignment: 'AUTO' } },
  };
}

function listItem(text) {
  return {
    type: 'LIST_ITEM',
    id: nodeId(),
    nodes: [paragraph(text)],
  };
}

/**
 * Markdown to Ricos. Handles the shapes the blog engine actually produces:
 * H2/H3 headings, paragraphs, bullet lists, bold and links. Anything else is
 * carried through as a paragraph rather than silently dropped.
 */
export function toRichContent(markdown) {
  const nodes = [];
  const lines = String(markdown || '').split('\n');
  let bullets = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    nodes.push({
      type: 'BULLETED_LIST',
      id: nodeId(),
      nodes: bullets.map(listItem),
      bulletedListData: { indentation: 0 },
    });
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushBullets(); continue; }
    if (/^###\s+/.test(line)) { flushBullets(); nodes.push(heading(line.replace(/^###\s+/, ''), 3)); continue; }
    if (/^##\s+/.test(line)) { flushBullets(); nodes.push(heading(line.replace(/^##\s+/, ''), 2)); continue; }
    if (/^#\s+/.test(line)) { flushBullets(); nodes.push(heading(line.replace(/^#\s+/, ''), 2)); continue; }
    if (/^[-*]\s+/.test(line)) { bullets.push(line.replace(/^[-*]\s+/, '')); continue; }
    flushBullets();
    nodes.push(paragraph(line));
  }
  flushBullets();
  return { nodes };
}

/**
 * Create the post as a Wix draft and publish it.
 *
 * Returns the live URL. Throws with the Wix error text on failure, which is the
 * useful thing to show AJ: a missing Blog permission on the custom app reads as
 * a permission_denied and tells him exactly what to tick.
 */
export async function publishDraft(d) {
  const title = d.query || d.working_title || d.meta_title;
  if (!title) throw new Error('No title on this draft.');
  if (!d.body) throw new Error('No body on this draft.');

  const categoryId = CATEGORY_IDS[d.category];
  const draftPost = {
    title,
    memberId: AUTHOR_MEMBER_ID,
    richContent: toRichContent(d.body),
    ...(categoryId ? { categoryIds: [categoryId] } : {}),
    ...(Array.isArray(d.tags) && d.tags.length ? { hashtags: d.tags } : {}),
    seoSlug: d.slug || undefined,
    seoData: {
      tags: [
        ...(d.meta_title ? [{ type: 'title', children: d.meta_title }] : []),
        ...(d.meta_description
          ? [{ type: 'meta', props: { name: 'description', content: d.meta_description } }]
          : []),
      ],
    },
  };

  const created = await wixApi('/blog/v3/draft-posts', { method: 'POST', body: { draftPost } });
  const id = created?.draftPost?.id;
  if (!id) throw new Error(`Wix accepted the draft but returned no id: ${JSON.stringify(created).slice(0, 200)}`);

  const published = await wixApi(`/blog/v3/draft-posts/${id}/publish`, { method: 'POST' });
  const post = published?.post || published?.draftPost || {};
  const slug = post.slug || d.slug;
  return {
    id: post.id || id,
    url: post.url?.path
      ? `https://www.designbees.com.au${post.url.path}`
      : slug
        ? `https://www.designbees.com.au/post/${slug}`
        : null,
  };
}

export function categoryKnown(category) {
  return Boolean(CATEGORY_IDS[category]);
}
