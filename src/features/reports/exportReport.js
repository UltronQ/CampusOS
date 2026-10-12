import * as XLSX from 'xlsx';
import { toCsvRow } from '../../utils/csvSafety.js';
import { normalizeReportInput, buildReport } from './reportEngine.js';
export { REPORT_DEFINITIONS, PRIMARY_REPORT_KINDS } from './reportDefinitions.js';
export { normalizeReportInput, buildReport } from './reportEngine.js';

const LIMIT = 50000;
const failure = (code,message) => Object.assign(new Error(message),{code});
function sheet(rows, columns) {
  const ws=XLSX.utils.aoa_to_sheet([columns.map((c)=>c.heading),...rows.map((r)=>columns.map((c)=>r[c.key]??null))]);
  ws['!cols']=columns.map((c)=>({wch:Math.min(48,Math.max(16,c.heading.length+2))}));
  if (ws['!ref']) ws['!autofilter']={ref:ws['!ref']};
  return ws;
}

/** Pure serializer; authorization and fresh database reads are in the service below. */
export function serializeReport(report, format='csv') {
  if (!['csv','xlsx'].includes(format)) throw failure('INVALID_INPUT','Unsupported export format.');
  const detailCount=format==='xlsx'?report.item_rows.length:0;
  if (report.rows.length+detailCount>LIMIT) throw failure('EXPORT_LIMIT','Export exceeds 50,000 data rows. Narrow the filters; no records were truncated.');
  const date=new Date(report.snapshot_at).toISOString();
  const batch=report.filters.graduation_years.length?'_batch-'+report.filters.graduation_years.join('-'):'';
  const filename='campusos_'+report.kind+batch+'_'+date.replace(/[:.]/g,'-')+'.'+format;
  let blob; let sheets; let row_count;
  if (format==='csv') {
    const csv='\ufeff'+toCsvRow(report.columns.map((c)=>c.heading))+report.rows.map((r)=>toCsvRow(report.columns.map((c)=>r[c.key]))).join('');
    blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    sheets=[{name:'Report',row_count:report.rows.length}]; row_count=report.rows.length;
  } else {
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,sheet(report.rows,report.columns),'Report');
    sheets=[{name:'Report',row_count:report.rows.length}];
    if (report.item_rows.length) {
      XLSX.utils.book_append_sheet(wb,sheet(report.item_rows,report.item_columns),'Checklist items');
      sheets.push({name:'Checklist items',row_count:report.item_rows.length});
    }
    const metadata=[
      {field:'Report',value:report.title},{field:'Database snapshot (UTC)',value:date},
      {field:'Filters',value:report.filter_summary.join(' | ')},{field:'Student scope',value:report.student_ids.length?'Selected authorized students':'All authorized students matching filters'},
      {field:'Placement percentage denominator',value:report.placement_denominator??'Not applicable'},
      {field:'Report records',value:report.rows.length},
    ];
    XLSX.utils.book_append_sheet(wb,sheet(metadata,[{key:'field',heading:'Field'},{key:'value',heading:'Value'}]),'Metadata');
    sheets.push({name:'Metadata',row_count:metadata.length});
    wb.Props={Title:report.title,Subject:'CampusOS authorized report',CreatedDate:new Date(date)};
    blob=new Blob([XLSX.write(wb,{type:'array',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    row_count=sheets.reduce((sum,s)=>sum+s.row_count,0);
  }
  return {contract_version:report.contract_version,snapshot_at:report.snapshot_at,filename,mime_type:blob.type,blob,
    row_count,report_row_count:report.rows.length,columns:report.columns.map((c)=>c.key),sheets,
    warnings:format==='csv'?['Use text-column import settings for roll numbers with leading zeroes; Excel downloads retain string cell types.']:[]};
}

export function createReportingService(getClient) {
  const getReport=async(rawInput)=>{
    const input=normalizeReportInput(rawInput);
    const {data,error}=await getClient().rpc('get_campusos_report_snapshot',{p_kind:input.kind});
    if (error) throw failure(error.code==='42501'?'FORBIDDEN':'DATABASE_ERROR',error.message);
    return buildReport(data,input);
  };
  return {getReport,exportReport:async(input)=>serializeReport(await getReport(input),input.format??'csv')};
}
export async function getReport(input) {
  const {getSupabase}=await import('../../lib/supabaseClient.js');
  return createReportingService(getSupabase).getReport(input);
}
export async function exportReport(input) {
  const {getSupabase}=await import('../../lib/supabaseClient.js');
  return createReportingService(getSupabase).exportReport(input);
}
export function downloadReportFile(output) {
  const url=URL.createObjectURL(output.blob); const anchor=document.createElement('a');
  anchor.href=url;anchor.download=output.filename;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** Dedicated printable document: textContent protects names/remarks from HTML injection. */
export function printReportDocument(report) {
  const frame=document.createElement('iframe');frame.title='CampusOS report print document';
  frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;';
  document.body.append(frame);const doc=frame.contentDocument;
  const add=(tag,text,parent=doc.body)=>{const element=doc.createElement(tag);element.textContent=String(text??'');parent.append(element);return element;};
  doc.title=report.title;
  const style=doc.createElement('style');style.textContent='@page{size:landscape;margin:12mm}body{font:11px Arial}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #aaa;padding:5px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}h1{font-size:18px}';doc.head.append(style);
  add('h1',report.title);add('p','Database snapshot (UTC): '+new Date(report.snapshot_at).toISOString());
  add('p','Selected filters: '+report.filter_summary.join(' · '));
  if (report.placement_denominator) add('p','Placement percentage: unique placed students / selected student cohort × 100.');
  const table=(rows,columns)=>{const t=add('table','');const head=add('thead','',t);const hr=add('tr','',head);columns.forEach((c)=>add('th',c.heading,hr));const body=add('tbody','',t);rows.forEach((r)=>{const tr=add('tr','',body);columns.forEach((c)=>add('td',r[c.key],tr));});};
  table(report.rows,report.columns);
  if (!report.rows.length) add('p','No records match the selected filters.');
  if (report.item_rows.length) {add('h2','No-dues checklist details');table(report.item_rows,report.item_columns);}
  const cleanup=()=>frame.remove();frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});
  frame.contentWindow.focus();frame.contentWindow.print();setTimeout(cleanup,60000);
}
