// Fictional deterministic records. Production only reads these after trusted seeding.
export const DEMO_TIMESTAMP='2026-10-12T09:00:00.000Z';
export const demoId=(prefix,n)=>`${prefix}000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
export const DEMO_DEPARTMENTS=[
  {id:'11111111-1111-1111-1111-111111111111',code:'CSE',name:'Computer Science'},
  {id:'22222222-2222-2222-2222-222222222222',code:'ECE',name:'Electronics'},
  {id:'33333333-3333-3333-3333-333333333333',code:'ME',name:'Mechanical'},
];
export const DEMO_ACCOUNTS=Object.freeze([
  {slug:'incharge',email:'campusos.incharge@example.test',role:'placement_incharge',student_id:null},
  {slug:'student-cse',email:'campusos.student01@example.test',role:'student',student_id:demoId('90',1)},
  {slug:'student-ece',email:'campusos.student12@example.test',role:'student',student_id:demoId('90',12)},
  {slug:'student-me',email:'campusos.student21@example.test',role:'student',student_id:demoId('90',21)},
]);
export function demoData() {
  const students=Array.from({length:30},(_,i)=>{
    const n=i+1;
    return {id:demoId('90',n),student_number:`DEMO-${String(n).padStart(3,'0')}`,full_name:`Demo Student ${String(n).padStart(2,'0')}`,
      email:`campusos.student${String(n).padStart(2,'0')}@example.test`,department_id:DEMO_DEPARTMENTS[Math.floor(i/10)].id,
      graduation_year:n%2?2027:2028,cgpa:n<=2?9:Number((6+(n%9)*0.4).toFixed(2)),backlogs:n<=2?0:n%4,
      phone:null,placement_registered:n%5!==0,eligibility_status:n%5?'eligible':'ineligible',program:'B.Tech',academic_year:4,section:'Demo'};
  });
  const companies=['Demo Meridian Labs','Demo Northstar Systems','Demo Circuit Works','Demo Workshop Group','Demo Horizon Engineering'].map((name,i)=>({id:demoId('91',i+1),name}));
  const drives=[
    {id:demoId('92',1),company_id:companies[0].id,title:'Demo CSE Engineering',status:'published',start_date:'2026-10-01',department_ids:[DEMO_DEPARTMENTS[0].id],graduation_years:[2027,2028],minimum_cgpa:7,maximum_backlogs:1},
    {id:demoId('92',2),company_id:companies[1].id,title:'Demo All-Department Associates',status:'completed',start_date:'2026-10-03',department_ids:[],graduation_years:[2027,2028],minimum_cgpa:6,maximum_backlogs:3},
    {id:demoId('92',3),company_id:companies[2].id,title:'Demo Cancelled ECE Drive',status:'cancelled',start_date:'2026-10-05',department_ids:[DEMO_DEPARTMENTS[1].id],graduation_years:[2027,2028],minimum_cgpa:7,maximum_backlogs:1},
    {id:demoId('92',4),company_id:companies[3].id,title:'Demo Planned ME Drive',status:'draft',start_date:'2026-10-20',department_ids:[DEMO_DEPARTMENTS[2].id],graduation_years:[],minimum_cgpa:null,maximum_backlogs:null},
    {id:demoId('92',5),company_id:companies[4].id,title:'Demo ME Graduate Engineer',status:'published',start_date:'2026-10-10',department_ids:[DEMO_DEPARTMENTS[2].id],graduation_years:[2028],minimum_cgpa:7,maximum_backlogs:1},
  ].map((d)=>({...d,eligible_graduation_years:d.graduation_years,min_cgpa:d.minimum_cgpa,max_backlogs:d.maximum_backlogs}));
  const applicationCases=[[1,1,'selected'],[1,2,'selected'],[2,1,'selected'],[3,2,'in_progress'],[12,3,'selected'],[4,2,'withdrawn'],[24,5,'selected'],[5,2,'selected'],[6,2,'rejected'],[13,2,'applied'],[21,2,'selected'],[22,2,'selected']];
  const applications=applicationCases.map(([s,d,status],i)=>({id:demoId('93',i+1),student_id:demoId('90',s),drive_id:demoId('92',d),status}));
  const offerCases=[[1,'offered',80000000],[2,'accepted',120000000],[3,'accepted',100000000],[5,'accepted',990000000],[6,'accepted',880000000],[7,'accepted',null],[8,'declined',770000000],[11,'accepted',60000000],[12,'revoked',660000000]];
  const offers=offerCases.map(([a,status,annual_ctc_minor],i)=>({id:demoId('95',i+1),application_id:demoId('93',a),status,annual_ctc_minor,currency:'INR'}));
  const itemCases=[[0,'Library',true,true],[0,'Laboratory',true,true],[0,'Optional Survey',false,true],[0,'Inactive Archive',true,false],
    [1,'Department Fees',true,true],[1,'Document Return',true,true],[1,'Optional Survey',false,true],[2,'Optional Exit Survey',false,true]];
  const clearance_items=itemCases.map(([d,name,is_mandatory,is_active],i)=>({id:demoId('94',i+1),department_id:DEMO_DEPARTMENTS[d].id,name,is_mandatory,is_active}));
  const student_clearances=[];
  for(let n=1;n<=30;n++) {
    const mandatory=n<=10?[1,2]:n<=20?[5,6]:[];
    const optional=n<=10?3:n<=20?7:8;
    const add=(item,status)=>student_clearances.push({id:demoId('99',n*100+item),student_id:demoId('90',n),clearance_item_id:demoId('94',item),status,
      remarks:status==='rejected'?'Demonstration: return the recorded item':null,pending_requirements:status==='rejected'?['Return the demonstration item']:[],
      approved_at:['cleared','not_applicable'].includes(status)?DEMO_TIMESTAMP:null});
    if(mandatory.length) {
      if(n%5===1){add(mandatory[0],'cleared');add(mandatory[1],'not_applicable');}
      if(n%5===2){add(mandatory[0],'pending');add(mandatory[1],'cleared');}
      if(n%5===3){add(mandatory[0],'rejected');add(mandatory[1],'cleared');}
      if(n%5===4)add(mandatory[0],'cleared');
    }
    add(optional,n%5===1?'rejected':'pending');
  }
  return {departments:DEMO_DEPARTMENTS,companies,students,drives,applications,offers,clearance_items,student_clearances,
    drive_departments:drives.flatMap((d)=>d.department_ids.map((department_id)=>({drive_id:d.id,department_id}))),
    recruitment_stages:[{id:demoId('97',1),drive_id:demoId('92',1),name:'Demo Interview',sequence:1},{id:demoId('97',2),drive_id:demoId('92',2),name:'Demo Technical Round',sequence:1}],
    application_stage_results:[{id:demoId('98',1),application_id:demoId('93',1),stage_id:demoId('97',1),status:'passed',published_at:DEMO_TIMESTAMP},{id:demoId('98',2),application_id:demoId('93',2),stage_id:demoId('97',2),status:'pending',published_at:null}]};
}
export const DEMO_EXPECTED=Object.freeze({
  total_students:30,registered_students:24,eligible_students:30,participating_students:9,applications:10,
  placed_students:4,unplaced_students:26,successful_offers:5,students_with_multiple_offers:1,placement_percent:13.33,
  salary_count:4,highest_package_minor:120000000,average_package_minor:90000000,
  cleared_students:4,incomplete_students:16,not_configured_students:10,
  mandatory_total:40,mandatory_cleared:16,mandatory_not_applicable:4,mandatory_pending:4,mandatory_rejected:4,mandatory_missing:12,
});
