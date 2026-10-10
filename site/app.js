'use strict';
/* Public packets are read-only. No accounts, registrations or student state. */
(function () {
  const pages = ['overview','courses','credits','exams','timeline','universities','founder','glossary','sources'];
  const list = value => Array.isArray(value) ? value : [];
  const text = value => value == null ? '' : String(value);
  const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title = key => text(key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  function safeURL(value) {
    try {
      const url = new URL(value);
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url.hostname)) return '';
      return url.href;
    } catch { return ''; }
  }
  function link(label, url) {
    const href = safeURL(url);
    return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label || href)}</a>` : esc(label || url);
  }
  const bullets = values => list(values).length ? `<ul>${values.map(v => `<li>${typeof v === 'object' ? fields(v) : esc(v)}</li>`).join('')}</ul>` : '';
  const steps = values => list(values).length ? `<ol>${values.map(v => `<li>${typeof v === 'object' ? fields(v) : esc(v)}</li>`).join('')}</ol>` : '';
  const hiddenKeys = new Set(['id','schema_version','source_ids','payload','general_payload_action','verification']);
  function fields(value, depth = 0) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return bullets(value);
    if (typeof value !== 'object') return `<p>${esc(value)}</p>`;
    if (typeof value.url === 'string' && Object.keys(value).every(k => ['url','label','title'].includes(k))) return `<p>${link(value.label || value.title, value.url)}</p>`;
    return `<div class="${depth ? 'nested-fields' : 'data-fields'}">${Object.entries(value).filter(([k,v]) => !hiddenKeys.has(k) && v != null && v !== '' && (!Array.isArray(v) || v.length)).map(([k,v]) => {
      const label = title(k);
      const body = (k === 'url' || k.endsWith('_url')) && typeof v === 'string' ? `<p>${link(label, v)}</p>` : fields(v, depth + 1);
      return `<section class="data-field"><h4>${esc(label)}</h4>${body}</section>`;
    }).join('')}</div>`;
  }
  function validateMain(data) {
    if (!data || data.schema_version !== 1) throw new Error('Unsupported school content version.');
    const keys = ['meta','labels','overview','graduation','courses','exams','timeline','universities','university_planning','founder','glossary','sources'];
    for (const key of keys) if (!(key in data)) throw new Error(`Missing school section: ${key}.`);
    for (const key of ['courses','exams','universities','glossary','sources']) if (!Array.isArray(data[key])) throw new Error(`Invalid school section: ${key}.`);
    for (const key of ['courses','exams','universities']) {
      const ids = new Set();
      for (const item of data[key]) {
        if (!item || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id)) throw new Error(`Invalid or duplicate ${key} ID.`);
        ids.add(item.id);
      }
    }
    return data;
  }
  function validateExtra(data) {
    if (!data || data.schema_version !== 1 || !Array.isArray(data.universities)) throw new Error('Unsupported additional university content.');
    return data;
  }
  function collectWarnings(value, path = '', result = []) {
    if (!value || typeof value !== 'object') return result;
    for (const [key, item] of Object.entries(value)) {
      if (['warnings','warning','limit','availability_limit','dated_limit','integration_notes','campus_difference','minimum_vs_competitive'].includes(key)) result.push({label: title(path ? `${path}: ${key}` : key), value: item});
      else if (item && typeof item === 'object' && key !== 'sources') collectWarnings(item, path ? `${path} / ${title(key)}` : title(key), result);
    }
    return result;
  }
  function universities(main, extra) {
    return [...list(main?.universities).map(raw => ({id:raw.id,name:raw.name,country:raw.country,location:raw.location,raw,kind:'main'})), ...list(extra?.universities).map(raw => ({id:raw.id.replace(/_/g,'-'),name:raw.name,country:raw.category?.startsWith('US') ? 'United States' : 'Canada',location:raw.campus,raw,kind:'extra'}))];
  }
  const contract = {esc,safeURL,fields,validateMain,validateExtra,collectWarnings,universities};
  if (typeof module !== 'undefined' && module.exports) module.exports = contract;
  if (typeof document === 'undefined') return;

  let main = null, extra = null, unis = [], selectedUni = '', uniTab = 'route', errors = [], courseQuery = '', subjectFilter = '', statusFilter = '';
  const view = document.querySelector('#view'), warning = document.querySelector('#data-warning'), dialog = document.querySelector('#detail-dialog');
  const courseById = id => list(main?.courses).find(c => c.id === id);
  const footer = () => `<footer class="page-footer"><span>Planning guide. No registration or admission guarantee.</span><a href="#sources">Read the sources & limits</a></footer>`;
  const head = (n,h,lead) => `<header class="page-head"><p class="eyebrow">${esc(n)} / School Route Atlas</p><h1>${esc(h)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}</header>`;
  const empty = (label = 'This section is waiting for the school content packet.') => `<div class="empty-state"><p>${esc(label)}</p><button class="button secondary" data-retry>Reload content</button></div>`;
  function badge(status) {
    const s = text(status), kind = /approval|conditional|confirm/i.test(s) ? 'approval' : /optional/i.test(s) ? 'optional' : /goal|specific/i.test(s) ? 'goal' : '';
    return s ? `<span class="badge ${kind}">${esc(main?.labels?.[s] || s)}</span>` : '';
  }
  function block(label, value, ordered = false) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '';
    return `<section class="content-block"><h3>${esc(label)}</h3>${ordered && Array.isArray(value) ? steps(value) : fields(value)}</section>`;
  }
  function warningBlock(value) {
    const entries = collectWarnings(value);
    return entries.length ? `<aside class="notice"><h4>Important limits</h4>${entries.map(e => `<h4>${esc(e.label)}</h4>${fields(e.value)}`).join('')}</aside>` : '';
  }
  function sourceRefs(ids) {
    const records = list(ids).map(id => list(main?.sources).find(s => s.id === id)).filter(Boolean);
    return records.length ? `<section class="content-block"><h3>Official sources</h3><ul class="source-list">${records.map(s => `<li>${link(s.title || s.label || s.name,s.url)}${s.supports ? `<p>${esc(s.supports)}</p>` : ''}</li>`).join('')}</ul></section>` : '';
  }
  function prereqs(course) {
    const p = course.prerequisites || {}, item = r => {
      const c = courseById(r.course_id);
      return `<li>${c ? `<button class="prereq-link" data-course="${esc(c.id)}">${esc(c.name)}</button>` : esc(title(r.course_id))}${r.min_percent != null && r.min_percent !== '' ? `: minimum ${esc(r.min_percent)}%` : ''}${r.concurrent === true || r.concurrent === 'true' ? ' (may be concurrent)' : ''}</li>`;
    };
    return `${list(p.all).length ? `<h4>All of these</h4><ul>${p.all.map(item).join('')}</ul>` : ''}${list(p.any).length ? `<h4>One of these alternatives</h4><ul>${p.any.map(item).join('')}</ul>` : ''}${p.note ? `<p class="notice">${esc(p.note)}</p>` : ''}${!list(p.all).length && !list(p.any).length && !p.note ? '<p>No prerequisite detail is listed here. Confirm eligibility with the school.</p>' : ''}`;
  }
  function showDetail(kind,id) {
    const data = kind === 'course' ? courseById(id) : list(main?.exams).find(e => e.id === id);
    if (!data) return;
    const body = document.querySelector('#detail-body');
    body.innerHTML = `<p class="eyebrow">${kind === 'course' ? 'Course guide' : 'Exam guide'}</p><h2 id="detail-title">${esc(data.name)}</h2><div class="meta-row">${badge(data.status)}${kind === 'course' ? `<span>${esc(data.credits)} credits</span><span>Level ${esc(data.level)}</span>` : ''}</div>${block('What it is for',data.purpose)}${kind === 'course' ? `<section class="content-block"><h3>Before this course</h3>${prereqs(data)}</section>` : block('Required for',data.required_for)}${block('What to learn',data.learn)}${block(kind === 'course' ? 'How you are assessed' : 'Exam format',kind === 'course' ? data.assessment : data.format)}<div class="detail-grid">${block('How to access it',data.access_steps,true)}${block(kind === 'course' ? 'How to study' : 'How to prepare',kind === 'course' ? data.study_steps : data.prepare_steps,true)}</div>${block('Warnings & exceptions',data.warnings)}${block('Useful links',data.links)}${sourceRefs(data.source_ids)}`;
    if (!dialog.open) dialog.showModal();
    body.scrollTop = 0; dialog.scrollTop = 0;
    document.querySelector('.dialog-close').focus();
  }
  function ladder() {
    if (!main?.courses.length) return empty();
    const family = c => /^(Physics|Chemistry|French)/.exec(c.name)?.[1] || c.subject;
    const academic = [...new Set(main.courses.map(family))].filter(s => s !== 'Options');
    return `<table class="ladder-table"><caption class="sr-only">Course levels. Click a course to read exact prerequisites.</caption><thead><tr><th scope="col">Subject</th><th scope="col">Level 10</th><th scope="col">Level 20</th><th scope="col">Level 30 / 31</th></tr></thead><tbody>${academic.map(s => `<tr><th scope="row">${esc(s)}</th>${[10,20,30].map(level => `<td>${main.courses.filter(c => family(c) === s && (level === 30 ? Number(c.level) >= 30 : Number(c.level) === level)).map(c => `<button class="course-node" data-course="${esc(c.id)}"><b>${esc(c.name)}</b><small>${esc(c.credits)} credits / details</small></button>`).join('') || '<span class="empty-node">Not in this plan</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="text-small">Levels describe course progression, not your current registration. Exact marks, alternatives and concurrent rules are inside each course.</p>`;
  }
  function overview() {
    return `<section class="hero"><div><p class="eyebrow">A route through school, then beyond it</p><h1>Understand the path.<br>Choose your next step.</h1><p class="lead">Explore Alberta courses, credits and exams, then compare university routes and ways to keep building alongside school.</p><div class="actions"><a class="button" href="#courses">Explore the courses <span aria-hidden="true">↗</span></a><a class="text-link" href="#universities">Compare university routes</a></div></div><aside class="hero-aside"><strong>${unis.length}</strong><span>university routes loaded</span><small>Different admissions, costs and paths into computer science.</small></aside></section><div class="notice"><p>School status is unknown. The fast route is conditional, not an approved registration plan. Published requirements and minimums do not guarantee admission.</p></div><div class="route-strip"><section class="route-stage"><span class="stage-number">01</span><h3>Build the foundation</h3><p>See what each course teaches and what must come before it.</p><a href="#courses">Courses & prerequisites</a></section><section class="route-stage"><span class="stage-number">02</span><h3>Make the credits count</h3><p>Separate a diploma's requirements from university admission subjects.</p><a href="#credits">Read the credit map</a></section><section class="route-stage"><span class="stage-number">03</span><h3>Choose the next environment</h3><p>Compare the degree route, application, price basis and founder community.</p><a href="#universities">University explorer</a></section></div>${main ? block('The whole route',main.overview) : ''}<div class="section-bar"><h2>The course ladder</h2><span>Click to understand a prerequisite</span></div>${ladder()}<div class="split-content">${main ? block('How to read the labels',main.labels) : ''}<div><div class="section-bar"><h2>Go deeper</h2></div><div class="link-list"><a href="#exams">Which exams, and why? <span aria-hidden="true">↗</span></a><a href="#timeline">What makes a faster route conditional? <span aria-hidden="true">↗</span></a><a href="#founder">How can building fit beside school? <span aria-hidden="true">↗</span></a></div></div></div>`;
  }
  function courseRows() {
    const matches = list(main?.courses).filter(c => (!courseQuery || [c.name,c.subject,c.purpose,...list(c.learn)].join(' ').toLowerCase().includes(courseQuery.toLowerCase())) && (!subjectFilter || c.subject === subjectFilter) && (!statusFilter || c.status === statusFilter));
    return `<p class="result-count" role="status">${matches.length} of ${list(main?.courses).length} courses</p><div class="course-list">${matches.map(c => `<button class="course-row" data-course="${esc(c.id)}"><div><div class="meta-row">${badge(c.status)}<span>${esc(c.credits)} credits</span></div><h3>${esc(c.name)}</h3><p>${esc(c.purpose)}</p></div><span class="row-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>${matches.length ? '' : '<p class="empty-state">No courses match. Try another word or reset the filters.</p>'}`;
  }
  function courses() {
    return `${head('02','Know what you are learning.','Search by course, subject or topic. Open a course for learning goals, prerequisites, assessments and access steps.')}${main ? `<div class="toolbar"><label class="search-label">Search courses<input id="course-search" type="search" value="${esc(courseQuery)}" placeholder="Try calculus, physics or writing"></label><label>Subject<select id="subject-filter"><option value="">All subjects</option>${[...new Set(main.courses.map(c=>c.subject))].map(s=>`<option ${s===subjectFilter?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Purpose<select id="status-filter"><option value="">All labels</option>${[...new Set(main.courses.map(c=>c.status))].map(s=>`<option value="${esc(s)}" ${s===statusFilter?'selected':''}>${esc(main.labels[s]||s)}</option>`).join('')}</select></label><button class="button secondary" data-reset-courses>Reset</button></div><div id="course-results">${courseRows()}</div><div class="section-bar"><h2>See the progression</h2></div>${ladder()}` : empty()}`;
  }
  function credits() {
    if (!main) return head('03','A diploma is more than a total.','Graduation categories and university admission subjects are separate checks.') + empty();
    const g = main.graduation, buckets = list(g.illustration_buckets), total = buckets.reduce((n,b)=>n+Number(b.credits),0);
    const bucketCourses = name => main.courses.filter(c => name==='Options' ? c.subject==='Options' : name==='Art' ? c.id==='art10' : name==='Distinct CTS' ? c.id.startsWith('cts-') : name==='CALM' ? c.id==='calm' : name==='PE 10' ? c.id==='pe10' : name==='French' ? c.id.startsWith('french') : c.subject===name);
    return `${head('03','A diploma is more than a total.',g.credit_explanation)}<div class="credit-total"><strong>${total}</strong><span>credits in the conditional illustration<br>Minimum diploma total: ${esc(g.minimum_credits)}.</span></div><div class="credit-bar" role="img" aria-label="${esc(buckets.map(b=>`${b.name}: ${b.credits} planned credits`).join('; '))}">${buckets.map(b=>`<span style="flex:${Number(b.credits)}" aria-hidden="true">${esc(b.credits)}</span>`).join('')}</div><div class="credit-legend">${buckets.map(b=>`<button data-credit-bucket="${esc(b.name)}"><span>${esc(b.name)}</span><b>${esc(b.credits)}</b></button>`).join('')}</div><p class="notice">${esc(g.bucket_warning)}</p><table class="ledger"><caption class="sr-only">Non-overlapping credits in the conditional route</caption><thead><tr><th scope="col">Category</th><th scope="col">Open the courses</th><th scope="col">Credits</th></tr></thead><tbody>${buckets.map(b=>`<tr><th scope="row">${esc(b.name)}</th><td>${bucketCourses(b.name).map(c=>`<button class="prereq-link" data-course="${esc(c.id)}">${esc(c.name)}</button>`).join(', ')}</td><td>${esc(b.credits)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Conditional total, not awarded credits</td><td>${total}</td></tr></tfoot></table><div class="section-bar"><h2>The category checks</h2><span>Included within the same total</span></div><div class="graduation-checks">${list(g.requirements).map(r=>`<section class="milestone">${badge(r.status)}<h3>${esc(r.name)}</h3><p>${esc(r.requirement)}</p><p class="text-small">${esc(r.route_choice)}</p></section>`).join('')}</div>${block('Passing and exam weighting',g.passing_explanation)}${block('Warnings & exceptions',g.warnings)}${sourceRefs(g.source_ids)}`;
  }
  function exams() {
    return `${head('04','Exams, without the mystery.','A school exam, a provincial diploma exam and an admissions test do different jobs. Open each guide to see what to learn, how to access it and when it matters.')}${main ? `<div class="exam-grid">${main.exams.map(e=>`<section class="exam-card">${badge(e.status)}<h3>${esc(e.name)}</h3><p>${esc(e.purpose)}</p><button class="button secondary" data-exam="${esc(e.id)}">Format, access & preparation <span aria-hidden="true">↗</span></button></section>`).join('')}</div>` : empty()}`;
  }
  function timeline() {
    const t=main?.timeline, terms=list(t?.terms);
    return `${head('05','A faster route needs real approvals.',t?.summary || 'Read this as a planning scenario, not approved registration.')}${t && terms.length ? `<div class="notice">${badge(t.status)} <strong>${esc(t.title)}</strong><p>${esc(t.fallback)}</p></div><div class="term-list">${terms.map(term=>`<section class="term"><div class="term-label">${esc(term.name)}<small>${esc(term.core_count)} core courses</small></div><div class="term-content"><div class="term-courses">${list(term.courses).map(id=>{const c=courseById(id);return c?`<button data-course="${esc(c.id)}">${esc(c.name)}</button>`:`<span>${esc(id)}</span>`;}).join('')}</div><p>${esc(term.note)}</p></div><div class="term-credit">${esc(term.credits)}<small>planned credits</small></div></section>`).join('')}</div><div class="section-bar"><h2>What must be confirmed</h2></div>${bullets(t.gates)}${block('Warnings that change the route',t.warnings)}<details class="planning-details"><summary>Study strategy & workload</summary>${block('Study strategy',t.speed_strategy)}${block('A possible weekly rhythm',t.workload)}</details>${block('Five senior academic subjects',list(t.academic30_31).map(id=>courseById(id)?.name || id))}${block('Questions for the school',t.counsellor_questions)}${sourceRefs(t.source_ids)}` : empty()}`;
  }
  function costPanel(cost) {
    if(!cost)return '';
    return `<section class="content-block"><h3>Published cost basis</h3><div class="meta-row"><strong>${esc(cost.currency)}</strong><span>${esc(cost.academic_year)}</span></div><p>${esc(cost.basis)}</p><p class="notice">${esc(cost.warning)}</p><table class="ledger cost-ledger"><caption class="sr-only">${esc(cost.currency)} cost illustrations. Subtotals and alternatives are not additive.</caption><thead><tr><th scope="col">Item or illustration</th><th scope="col">${esc(cost.currency)}</th></tr></thead><tbody>${list(cost.items).map(item=>`<tr><td>${esc(item.label)}<small>${esc(item.note)}</small></td><td>${typeof item.amount==='number'?esc(item.amount.toLocaleString('en-CA',{minimumFractionDigits:Number.isInteger(item.amount)?0:2,maximumFractionDigits:2})):esc(item.amount)}</td></tr>`).join('')}</tbody></table>${block('Excluded or unresolved',cost.excluded)}</section>`;
  }
  const tabs = [['route','Degree & entry'],['apply','Apply & testing'],['cost','Costs & aid'],['life','Campus & building'],['limits','Limits & sources']];
  function uniBody(u,tab) {
    const r = u.raw;
    if (u.kind === 'main') {
      if (tab === 'route') return `${block('Degree routes',r.degree_routes)}${block('Requirements',r.requirements)}${block('After entry: progression',r.progression)}`;
      if (tab === 'apply') return `${block('Application steps',r.application_steps,true)}${block('Testing',r.testing)}${block('Official links',r.links)}`;
      if (tab === 'cost') return `${costPanel(r.cost)}${block('Aid',r.aid)}<p class="notice">Different currencies, years and cost bases are not directly comparable. These are published illustrations, not a personal fee assessment or net price.</p>`;
      if (tab === 'life') return `${block('Campus life',r.campus_life)}${block('Founder routes',r.founder_routes)}`;
      return `${block('Warnings',r.warnings)}${block('Official links',r.links)}${sourceRefs(r.source_ids)}`;
    }
    if (tab === 'route') return `${block('Degree',r.degree)}${block('Admission route',r.admission_route)}${block('Alberta prerequisites',r.alberta_prerequisites)}${block('Minimum versus competitive',r.minimum_vs_competitive)}${block('Later specialization',r.specialization)}${block('Campus differences',r.campus_difference)}`;
    if (tab === 'apply') return `${block('Application',r.application)}${block('Testing',r.testing)}${block('Eligibility limits',r.alberta_prerequisites?.limit)}`;
    if (tab === 'cost') return `${block('Costs & aid',r.cost_aid)}<p class="notice">Keep the currency, academic year, course load and exclusions beside each price. A published budget is not an offer or net price.</p>`;
    if (tab === 'life') return block('Campus & founder community',r.community);
    return `${block('Route & eligibility caveats',r.admission_route)}${warningBlock(r)}<section class="content-block"><h3>Primary sources</h3><ol class="source-list">${list(r.sources).map(s=>`<li>${link(s.title,s.url)}<p>${esc(s.publisher)}${s.displayed_update?` / ${esc(s.displayed_update)}`:''}</p><p>${esc(s.supports || s.exact_support || '')}</p>${s.general_support?`<p>${esc(s.general_support)}</p>`:''}</li>`).join('')}</ol></section>`;
  }
  function uniDetail() {
    const u = unis.find(u=>u.id===selectedUni) || unis[0];
    if (!u) return empty('University content is not loaded yet.');
    selectedUni = u.id;
    return `<p class="eyebrow">${esc(u.country)} / ${esc(u.location)}</p><h2 class="uni-title">${esc(u.name)}</h2><p class="uni-degree">${esc(u.raw.summary || u.raw.admission_route)}</p>${u.kind === 'main' && u.raw.role ? badge(u.raw.role) : ''}<div class="detail-tabs" role="tablist" aria-label="University details">${tabs.map(([id,label])=>`<button role="tab" id="uni-tab-${id}" aria-controls="uni-panel" aria-selected="${id===uniTab}" tabindex="${id===uniTab?0:-1}" data-uni-tab="${id}">${label}</button>`).join('')}</div><div class="uni-panel" id="uni-panel" role="tabpanel" aria-labelledby="uni-tab-${uniTab}" tabindex="0">${uniBody(u,uniTab)}</div>`;
  }
  function compareColumn(u) {
    if (!u) return '';
    const r=u.raw;
    return `<section class="compare-column"><h3>${esc(u.name)}</h3><p class="text-small">${esc(u.country)} / ${esc(u.location)}</p>${block('Degree & entry',u.kind==='main'?r.degree_routes:r.degree)}${block('Requirements',u.kind==='main'?r.requirements:r.alberta_prerequisites)}${block('Progression',u.kind==='main'?r.progression:r.admission_route)}${block('Cost basis',u.kind==='main'?r.cost:r.cost_aid)}${block('Founder community',u.kind==='main'?r.founder_routes:r.community)}${u.kind==='main'?block('Warnings',r.warnings):warningBlock(r)}</section>`;
  }
  function universitiesPage() {
    const options = selected => unis.map(u=>`<option value="${esc(u.id)}" ${u.id===selected?'selected':''}>${esc(u.name)}</option>`).join('');
    return `${head('06','Choose a route, not just a name.','Admission, later program entry, cost and founder access are different questions. Keep the limits in view while comparing.')}${unis.length ? `<div class="university-layout"><nav class="uni-list" aria-label="University options">${unis.map((u,i)=>`<button class="uni-choice" data-uni="${esc(u.id)}" aria-pressed="${u.id===(selectedUni||unis[0].id)}"><strong><span class="uni-index">${String(i+1).padStart(2,'0')}</span>${esc(u.name)}</strong><small>${esc(u.country)}</small></button>`).join('')}</nav><article id="uni-detail">${uniDetail()}</article></div><details class="compare-heading"><summary>Compare two routes side by side</summary><div class="select-row"><label>First university<select id="compare-a">${options(unis[0].id)}</select></label><label>Second university<select id="compare-b">${options(unis[1]?.id || unis[0].id)}</select></label></div><div class="compare-grid" id="compare-result">${compareColumn(unis[0])}${compareColumn(unis[1]||unis[0])}</div></details>${main ? block('Application planning',main.university_planning):''}` : empty('University content is not loaded yet.')}`;
  }
  function founder() {
    return `${head('07','Keep building. Keep your options.','Use school for foundations, and projects for real practice. A university community can help, but access, funding and startup success are never automatic.')}${main ? fields(main.founder) : empty()}<div class="section-bar"><h2>What university communities actually offer</h2></div><div class="founder-rows">${unis.map(u=>`<section class="founder-row"><p class="eyebrow">${esc(u.country)}</p><h3>${esc(u.name)}</h3>${fields(u.kind==='main'?u.raw.founder_routes:u.raw.community)}<button class="button secondary" data-go-uni="${esc(u.id)}">Read the full route</button></section>`).join('')}</div>`;
  }
  function glossary() {
    return `${head('08','The words, in plain language.','Open a term for the meaning and the distinction that matters.')}${main ? `<div class="glossary-list">${main.glossary.map(g=>typeof g==='string'?`<p>${esc(g)}</p>`:`<details><summary>${esc(g.term || g.name || g.title)}</summary>${fields(Object.fromEntries(Object.entries(g).filter(([k])=>!['term','name','title'].includes(k))))}</details>`).join('')}</div>`:empty()}`;
  }
  function sourcesPage() {
    return `${head('09','The evidence, and its limits.','Official sources sit behind the claims. A rule can change; a source can leave a question open. Recheck the actual application year.')}${main ? `${block('About this packet',main.meta)}<section class="content-block"><h2>School & original university sources</h2><ol class="source-list">${main.sources.map(s=>`<li>${link(s.title || s.label || s.name,s.url)}${fields(Object.fromEntries(Object.entries(s).filter(([k])=>!['url','title','label','name','id'].includes(k))))}</li>`).join('')}</ol></section>`:empty()}${extra ? `<section class="content-block"><h2>Additional university research</h2>${fields(extra.report)}<p class="text-small">Checked ${esc(extra.checked_at)}. Detailed source links and warnings are retained under each university.</p>${unis.filter(u=>u.kind==='extra').map(u=>`<details class="source-section"><summary>${esc(u.name)}: limits & sources</summary>${uniBody(u,'limits')}</details>`).join('')}</section>`:''}`;
  }
  const renderers = {overview,courses,credits,exams,timeline,universities:universitiesPage,founder,glossary,sources:sourcesPage};
  function render(focus = false) {
    const page = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
    view.innerHTML = renderers[page]() + footer(); view.setAttribute('aria-busy','false');
    document.querySelectorAll('[data-page]').forEach(a=>{ if(a.dataset.page===page) a.setAttribute('aria-current','page');else a.removeAttribute('aria-current'); });
    document.title = `${view.querySelector('h1')?.textContent || 'Guide'} | School Route Atlas`;
    if (focus) { window.scrollTo(0,0); document.querySelector('#main').focus({preventScroll:true}); }
  }
  async function fetchPacket(path,validator) {
    const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),8000);
    try { const response=await fetch(path,{cache:'no-store',signal:controller.signal}); if(!response.ok) throw new Error(`HTTP ${response.status}`);return validator(await response.json()); } finally {clearTimeout(timeout);}
  }
  async function load() {
    view.setAttribute('aria-busy','true');
    const results = await Promise.allSettled([fetchPacket('content.json',validateMain),fetchPacket('additional-universities.json',validateExtra)]);
    main = results[0].status==='fulfilled'?results[0].value:null; extra=results[1].status==='fulfilled'?results[1].value:null;
    errors=results.map((r,i)=>r.status==='rejected'?(i===0?'School content could not be loaded. Courses, exams and the original university routes are unavailable.':'Additional university content could not be loaded. Its five routes are unavailable.'):null).filter(Boolean);
    if(main){const incomplete=['exams','universities','glossary','sources'].filter(k=>!main[k].length).concat(['timeline','founder','university_planning'].filter(k=>!Object.keys(main[k]||{}).length));if(incomplete.length)errors.push(`The school packet is still being completed: ${incomplete.map(title).join(', ')}. Available sections remain usable.`);}
    unis=universities(main,extra);if(!unis.some(u=>u.id===selectedUni))selectedUni=unis[0]?.id||'';
    warning.hidden=!errors.length;warning.innerHTML=errors.map(esc).join(' ') + (errors.length?'<button data-retry>Reload content</button>':'');
    document.querySelector('#checked-date').textContent=main?.meta?.checked_at?`Sources checked ${main.meta.checked_at}`:'Public-safe planning guide';
    render();
  }
  document.querySelector('.skip').addEventListener('click',event=>{
    event.preventDefault();
    const mainElement=document.querySelector('#main');
    mainElement.focus({preventScroll:true});
    mainElement.scrollIntoView({block:'start'});
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-retry'))void load();
    if(target.dataset.course)showDetail('course',target.dataset.course);
    if(target.dataset.exam)showDetail('exam',target.dataset.exam);
    if(target.dataset.uni){selectedUni=target.dataset.uni;document.querySelector('#uni-detail').innerHTML=uniDetail();document.querySelectorAll('[data-uni]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.uni===selectedUni));}
    if(target.dataset.uniTab){uniTab=target.dataset.uniTab;document.querySelector('#uni-detail').innerHTML=uniDetail();document.querySelector(`#uni-tab-${uniTab}`).focus();}
    if(target.dataset.goUni){selectedUni=target.dataset.goUni;uniTab='life';location.hash='universities';}
    if(target.dataset.creditBucket){const b=target.dataset.creditBucket;subjectFilter=['French','Art','Distinct CTS','CALM','PE 10'].includes(b)?'Options':b;courseQuery=b==='Distinct CTS'?'CTS':['French','Art','CALM','PE 10'].includes(b)?b==='PE 10'?'Physical Education':b:'';statusFilter='';location.hash='courses';}
    if(target.hasAttribute('data-reset-courses')){courseQuery='';subjectFilter='';statusFilter='';render();document.querySelector('#course-search').focus();}
  });
  document.addEventListener('input',event=>{if(event.target.id==='course-search'){courseQuery=event.target.value;document.querySelector('#course-results').innerHTML=courseRows();}});
  document.addEventListener('change',event=>{
    if(event.target.id==='subject-filter')subjectFilter=event.target.value;
    if(event.target.id==='status-filter')statusFilter=event.target.value;
    if(['subject-filter','status-filter'].includes(event.target.id))document.querySelector('#course-results').innerHTML=courseRows();
    if(['compare-a','compare-b'].includes(event.target.id))document.querySelector('#compare-result').innerHTML=compareColumn(unis.find(u=>u.id===document.querySelector('#compare-a').value))+compareColumn(unis.find(u=>u.id===document.querySelector('#compare-b').value));
  });
  document.addEventListener('keydown',event=>{
    if(!event.target.matches('[role="tab"]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const current=tabs.findIndex(([id])=>id===uniTab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
    uniTab=tabs[next][0];document.querySelector('#uni-detail').innerHTML=uniDetail();document.querySelector(`#uni-tab-${uniTab}`).focus();
  });
  document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  window.addEventListener('hashchange',()=>{if(dialog.open)dialog.close();render(true);});
  void load();
})();
