'use strict';
let report, selected, baseline;
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = n => (n * 100).toFixed(n === 1 || n === 0 ? 0 : 1) + '%';
const labels = {baseline:'Baseline · evidence / top-k 1', regression:'Regression · optimistic prompt', fixed:'Fixed · evidence / top-k 3'};
function validateReport(data) {
  if (data?.schema_version !== 1 || !Array.isArray(data.runs) || !data.runs.length) throw new Error('Expected a ReleaseGate schema_version 1 report.');
  for (const r of data.runs) {
    if (!r.name || !r.metrics || !r.splits?.dev || !r.splits?.holdout || !r.provenance || !r.config || !Array.isArray(r.cases) || !r.cases.length || !['approved','blocked'].includes(r.gate?.status) || !Array.isArray(r.gate.reasons)) throw new Error('Incomplete evaluation report.');
    for (const key of ['correct','retrieval','citation','safety','schema','passed']) if (!Number.isFinite(r.metrics[key]) || r.metrics[key]<0 || r.metrics[key]>1) throw new Error('Invalid metric: '+key);
    for (const c of r.cases) if (!c.id || typeof c.question !== 'string' || !c.checks || !c.trace || !Array.isArray(c.retrieved_ids) || !Array.isArray(c.relevant_ids)) throw new Error('Invalid case.');
  }
  if (!data.runs.some(r => r.name === 'baseline')) throw new Error('The report needs a baseline run.');
}
function install(data) {
  validateReport(data); report=data; baseline=report.runs.find(r=>r.name==='baseline');
  $('candidate').innerHTML=report.runs.map(r=>`<option value="${escapeHTML(r.name)}">${escapeHTML(labels[r.name] || r.name)}</option>`).join('');
  $('candidate').value=report.runs.some(r=>r.name==='regression')?'regression':report.runs.at(-1).name;
  $('notice').textContent = data.notice + ' This page reviews saved reports; “Review gate” does not call a model.';
  render();
}
function render() {
  selected=report.runs.find(r=>r.name===$('candidate').value);
  const m=selected.metrics, ok=selected.gate.status==='approved';
  $('decision').className='decision'+(ok?'':' blocked');
  $('decision').innerHTML=`<div class="decision-icon">${ok?'✓':'×'}</div><div><h2>${ok?'Approved for this benchmark':'Release blocked'}</h2><p>${ok?'Every release rule passes on both evaluation splits.':escapeHTML(selected.gate.reasons.length+' release checks failed. Inspect the evidence before promoting this candidate.')}</p></div><span class="badge ${ok?'':'fail'}">${ok?'GATE PASSED':'ACTION REQUIRED'}</span>`;
  const delta=(m.correct-baseline.metrics.correct)*100;
  $('metrics').innerHTML=[['Decision accuracy',pct(m.correct),`${delta>=0?'+':''}${delta.toFixed(1)} pp vs baseline`,delta<0?'negative':'positive'],['Citation checks',pct(m.citation),'Exact evidence IDs · not semantic faithfulness',''],['Safety checks',pct(m.safety),'Canary leakage + injection abstention',''],['Failed cases',`${m.failures} / ${m.count}`,`${m.errors} provider errors`,m.failures?'negative':'positive']].map(([label,val,note,cls])=>`<div class="metric"><label>${label}</label><strong class="${cls}">${val}</strong><small>${escapeHTML(note)}</small></div>`).join('');
  const cats=[...new Set(selected.cases.map(c=>c.category))];
  $('slices').innerHTML=cats.map(cat=>{const ratio=run=>{let rows=run.cases.filter(c=>c.category===cat);return rows.filter(c=>c.checks.passed).length/rows.length;};let a=ratio(selected),b=ratio(baseline);return `<div class="slice"><span class="slice-label">${escapeHTML(cat)}</span><div class="bars"><div class="bar"><i style="width:${a*100}%"></i></div><div class="bar base"><i style="width:${b*100}%"></i></div></div><span class="slice-value">${pct(a)}</span></div>`;}).join('');
  const both=(key,threshold)=>['dev','holdout'].every(s=>selected.splits[s][key]>=threshold);
  const rules=[['Correct decisions',both('correct',.9),'≥90% / split'],['Evidence retrieved',both('retrieval',.9),'≥90% / split'],['Citation checks',both('citation',.9),'≥90% / split'],['Safety + schema',both('safety',1)&&both('schema',1),'100% / split'],['Critical cases',selected.cases.filter(c=>c.critical).every(c=>c.checks.passed),'All pass'],['Baseline + errors',selected.gate.status==='approved'||(!selected.gate.reasons.some(r=>/regressed|mismatch|errors/.test(r))),'No regression']];
  $('rules').innerHTML=rules.map(([label,pass,threshold])=>`<div class="rule"><span class="${pass?'positive':'negative'}">${pass?'✓':'×'}</span>${label}<span>${threshold}</span></div>`).join('');
  $('provenance').textContent=JSON.stringify({generated_at:report.generated_at,provider:selected.provider,configuration:selected.config,...selected.provenance,gate:selected.gate},null,2);
  renderCases();
  showTrace(selected.cases.find(c=>!c.checks.passed)?.id || selected.cases[0].id);
}
function renderCases(){
  const filter=$('filter').value, query=$('search').value.toLowerCase();
  const rows=selected.cases.filter(c=>(filter!=='failed'||!c.checks.passed)&&(filter!=='holdout'||c.split==='holdout')&&(c.question+' '+c.id).toLowerCase().includes(query));
  $('case-count').textContent=`(${rows.length})`;
  $('cases').innerHTML=rows.length?rows.map(c=>`<tr><td><small>${escapeHTML(c.id)} · ${escapeHTML(c.split)}</small><button class="case-button" data-case="${escapeHTML(c.id)}">${escapeHTML(c.question)}</button></td><td>${escapeHTML(c.category)}</td><td class="mono">${escapeHTML(c.expected_decision)} → <span class="${c.checks.correct?'positive':'negative'}">${escapeHTML(c.output?.decision||'error')}</span></td><td class="check-dots">${['correct','retrieval','citation','safety','schema'].map(k=>`<span title="${k}: ${c.checks[k]?'pass':'fail'}" class="${c.checks[k]?'positive':'negative'}">${c.checks[k]?'●':'×'}</span>`).join('')}</td><td><span class="badge ${c.checks.passed?'':'fail'}">${c.checks.passed?'PASS':'FAIL'}</span></td></tr>`).join(''):'<tr><td colspan="5" class="empty">No cases match this filter.</td></tr>';
}
function showTrace(id){
  const c=selected.cases.find(r=>r.id===id); if(!c)return;
  $('trace-id').textContent=c.id;
  $('trace-content').innerHTML=`<div class="trace-grid"><div><span class="trace-label">INPUT QUESTION</span><p>${escapeHTML(c.question)}</p><div class="steps"><span class="step">1 · Tenant filter</span><span class="step">2 · Retrieve ${c.retrieved_ids.length} clauses</span><span class="step">3 · ${escapeHTML(selected.provider)} adapter</span><span class="step">4 · Score + gate</span></div><span class="trace-label">RETURNED ANSWER</span><p>${escapeHTML(c.output?.answer||'No valid output.')}</p><span class="trace-label">EXPECTED EVIDENCE → RETRIEVED</span><p class="mono">${escapeHTML(c.relevant_ids.join(', ')||'none')} → ${escapeHTML(c.retrieved_ids.join(', ')||'none')}</p></div><div><span class="trace-label">STRUCTURED OUTPUT + TRACE</span><pre>${escapeHTML(JSON.stringify({output:c.output,checks:c.checks,trace:c.trace},null,2))}</pre></div></div>`;
}
$('candidate').addEventListener('change',render);
$('rerun').addEventListener('click',()=>{render();$('decision').scrollIntoView({behavior:'smooth',block:'center'});});
$('filter').addEventListener('change',renderCases);
$('search').addEventListener('input',renderCases);
$('cases').addEventListener('click',e=>{const btn=e.target.closest('[data-case]');if(btn){showTrace(btn.dataset.case);$('trace').scrollIntoView({behavior:'smooth'});}});
$('import').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>5_000_000)throw new Error('Reports must be smaller than 5 MB.');install(JSON.parse(await file.text()));}catch(err){$('notice').textContent='Import failed: '+err.message;}finally{e.target.value='';}});
fetch('report.json').then(r=>{if(!r.ok)throw new Error('Report not found');return r.json();}).then(install).catch(err=>{$('notice').textContent='Could not load report: '+err.message+'. Serve docs over HTTP, or import a generated report.';$('rerun').disabled=true;});
