import { useEffect, useMemo, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import DashboardFilters, { EMPTY_PLACEMENT_FILTERS } from '../../components/dashboard/DashboardFilters';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { REPORT_DEFINITIONS, PRIMARY_REPORT_KINDS } from './reportDefinitions';

const loadEngine=()=>import('./exportReport.js');
const display=(v)=>v===null||v===undefined?'—':typeof v==='boolean'?(v?'Yes':'No'):String(v);
export default function ReportPage({personal=false}) {
  const [kind,setKind]=useState(personal?'student_placement_history':'department_placement');
  const [filters,setFilters]=useState(EMPTY_PLACEMENT_FILTERS),[studentId,setStudentId]=useState('');
  const [refresh,setRefresh]=useState(0),[report,setReport]=useState(null);
  const [options,setOptions]=useState({departments:[],companies:[],available_graduation_years:[],students:[]});
  const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(null),[notice,setNotice]=useState('');
  const family=REPORT_DEFINITIONS[kind].family;
  const studentReport=!['department_placement','company_outcomes','batch_placement_summary'].includes(kind);
  const input=useMemo(()=>({kind,filters:family==='no_dues'?{department_ids:filters.department_ids,graduation_years:filters.graduation_years}:filters,student_ids:studentId?[studentId]:[],columns:[]}),[kind,family,filters,studentId]);
  useEffect(()=>{
    let active=true;setLoading(true);setReport(null);setError(null);setNotice('');
    loadEngine().then((e)=>e.getReport(input)).then((result)=>{if(active){setReport(result);setOptions(result);}})
      .catch((e)=>{if(active)setError(e);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[input,refresh]);
  async function runAction(format) {
    setWorking(true);setError(null);setNotice('');
    try {
      const engine=await loadEngine();
      if(format==='print'){const current=await engine.getReport(input);setReport(current);engine.printReportDocument(current);}
      else {const out=await engine.exportReport({...input,format});engine.downloadReportFile(out);setNotice('Downloaded '+out.report_row_count+' record(s). '+out.warnings.join(' '));}
    } catch(e){setError(e);}finally{setWorking(false);}
  }
  const columns=report?.columns.map((c)=>({key:c.key,label:c.heading,render:(r)=><span className="inline-block max-w-md whitespace-pre-wrap break-words">{display(r[c.key])}</span>}))??[];
  return <ModulePage title={personal?'My Reports & Statements':'Reports & Exports'} description="Current database records with selected filters. CSV, Excel and printed reports use authorized snapshots.">
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
      <FormField label="Report type" as="select" value={kind} disabled={working} onChange={(e)=>{setKind(e.target.value);setFilters(EMPTY_PLACEMENT_FILTERS);setStudentId('');}}>
        {(personal?['student_placement_history','no_dues_statement']:PRIMARY_REPORT_KINDS).map((key)=><option key={key} value={key}>{REPORT_DEFINITIONS[key].title}</option>)}
      </FormField>
      {!personal&&studentReport?<FormField label="Student" as="select" value={studentId} disabled={working} onChange={(e)=>setStudentId(e.target.value)}><option value="">All students in scope</option>{options.students.map((s)=><option key={s.id} value={s.id}>{s.student_number} — {s.full_name}</option>)}</FormField>:null}
      {personal?<p className="text-sm text-slate-600">Only your own records are available. Database authorization enforces this scope.</p>:null}
    </div>
    <fieldset disabled={working} className="min-w-0">
      {family==='placement'?<DashboardFilters departments={options.departments} companies={options.companies} graduationYears={options.available_graduation_years} value={filters} onChange={setFilters}/>:<div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <FormField label="No-dues department" as="select" value={filters.department_ids[0]??''} onChange={(e)=>setFilters({...filters,department_ids:e.target.value?[e.target.value]:[]})}><option value="">All departments</option>{options.departments.map((d)=><option key={d.id} value={d.id}>{d.code}</option>)}</FormField>
        <FormField label="No-dues graduation batch" as="select" value={filters.graduation_years[0]??''} onChange={(e)=>setFilters({...filters,graduation_years:e.target.value?[Number(e.target.value)]:[]})}><option value="">All batches</option>{options.available_graduation_years.map((y)=><option key={y} value={y}>{y}</option>)}</FormField>
      </div>}
    </fieldset>
    {kind==='batch_placement_summary'?<p className="text-sm text-slate-600">Select exactly one graduation batch for the final summary.</p>:null}
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={working||loading} onClick={()=>setRefresh((n)=>n+1)}>Refresh report</Button>
      <Button disabled={!report||loading||working} onClick={()=>runAction('csv')}>Export CSV</Button>
      <Button disabled={!report||loading||working} onClick={()=>runAction('xlsx')}>Export Excel</Button>
      <Button variant="secondary" disabled={!report||loading||working} onClick={()=>runAction('print')}>Print report</Button>
    </div>
    {notice?<p role="status" className="text-sm text-emerald-700">{notice}</p>:null}
    {error?<ErrorState title="Report unavailable" error={error}/>:null}
    {loading?<LoadingState label="Loading authorized report…"/>:null}{working?<LoadingState label="Preparing current report…"/>:null}
    {report&&!loading?<section aria-label="Report preview" className="min-w-0 space-y-4">
      <h2 className="text-lg font-semibold">{report.title}</h2><p className="text-sm text-slate-600">Database snapshot: {new Date(report.snapshot_at).toLocaleString()} · {report.row_count} record(s)</p>
      <p className="break-words text-xs text-slate-500">Selected filters: {report.filter_summary.join(' · ')}</p>
      {report.placement_denominator?<p className="text-sm text-slate-600">Placement percentage = unique placed students ÷ selected department/batch cohort × 100.</p>:null}
      <DataTable rows={report.rows} columns={columns} caption={report.title} emptyTitle="No records match these filters" emptyMessage="Exports still contain column headings."/>
      {report.item_rows.length?<details><summary className="cursor-pointer font-medium">Full no-dues checklist details</summary><div className="mt-3"><DataTable rows={report.item_rows} columns={report.item_columns.map((c)=>({key:c.key,label:c.heading,render:(r)=>display(r[c.key])}))} caption="No-dues checklist details"/></div></details>:null}
    </section>:null}
  </ModulePage>;
}
