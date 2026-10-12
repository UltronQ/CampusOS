// Synthetic records only; readable IDs are replaced by UUIDs in database seeds.
export const fixture = {
  departments: [{id:'cse',code:'CSE',name:'Computer Science'}, {id:'ece',code:'ECE',name:'Electronics'}, {id:'me',code:'ME',name:'Mechanical'}],
  students: [
    {id:'s1',student_number:'001',full_name:'Demo Student One',email:'one@example.test',department_id:'cse',graduation_year:2027,cgpa:8.2,phone:null,backlogs:null},
    {id:'s2',student_number:'002',full_name:'Demo Student Two',email:'two@example.test',department_id:'cse',graduation_year:2027,cgpa:null,phone:null,backlogs:null},
    {id:'s3',student_number:'003',full_name:'Demo Student Three',email:'three@example.test',department_id:'cse',graduation_year:2027,cgpa:7,phone:null,backlogs:null},
    {id:'s4',student_number:'004',full_name:'Demo Student Four',email:'four@example.test',department_id:'ece',graduation_year:2027,cgpa:9,phone:null,backlogs:null},
    {id:'s5',student_number:'005',full_name:'Demo Student Five',email:'five@example.test',department_id:'me',graduation_year:2027,cgpa:null,phone:null,backlogs:null},
  ],
  companies: [{id:'co1',name:'Demo Systems'},{id:'co2',name:'Demo Labs'}],
  drives: [
    {id:'d1',company_id:'co1',title:'Graduate Engineer',start_date:'2026-10-01',status:'published'},
    {id:'d2',company_id:'co2',title:'Associate Engineer',start_date:'2026-10-12',status:'completed'},
    {id:'d3',company_id:'co1',title:'Cancelled Drive',start_date:'2026-10-10',status:'cancelled'},
    {id:'d4',company_id:'co2',title:'Draft Drive',start_date:'2026-10-11',status:'draft'},
  ],
  applications: [
    {id:'a1',student_id:'s1',drive_id:'d1',status:'selected'},
    {id:'a2',student_id:'s1',drive_id:'d2',status:'selected'},
    {id:'a3',student_id:'s2',drive_id:'d3',status:'selected'},
    {id:'a4',student_id:'s2',drive_id:'d1',status:'withdrawn'},
    {id:'a5',student_id:'s3',drive_id:'d1',status:'selected'},
    {id:'a6',student_id:'s4',drive_id:'d2',status:'selected'},
    {id:'a7',student_id:'s3',drive_id:'d2',status:'in_progress'},
    {id:'a8',student_id:'s5',drive_id:'d4',status:'selected'},
  ],
  offers: [
    {id:'o1',application_id:'a1',status:'offered',annual_ctc_minor:10000000,currency:'INR'},
    {id:'o2',application_id:'a2',status:'accepted',annual_ctc_minor:20000000,currency:'INR'},
    {id:'o3',application_id:'a3',status:'accepted',annual_ctc_minor:99000000,currency:'INR'},
    {id:'o4',application_id:'a4',status:'accepted',annual_ctc_minor:88000000,currency:'INR'},
    {id:'o5',application_id:'a5',status:'declined',annual_ctc_minor:77000000,currency:'INR'},
    {id:'o6',application_id:'a6',status:'accepted',annual_ctc_minor:null,currency:'INR'},
    {id:'o7',application_id:'a5',status:'revoked',annual_ctc_minor:66000000,currency:'INR'},
    {id:'o8',application_id:'a8',status:'accepted',annual_ctc_minor:55000000,currency:'INR'},
  ],
  clearance_items: [
    {id:'i1',department_id:'cse',name:'Library',is_mandatory:true,is_active:true},
    {id:'i2',department_id:'cse',name:'Lab',is_mandatory:true,is_active:true},
    {id:'i3',department_id:'ece',name:'Library',is_mandatory:true,is_active:true},
    {id:'i4',department_id:'cse',name:'Optional Survey',is_mandatory:false,is_active:true},
    {id:'i5',department_id:'cse',name:'Old Checklist',is_mandatory:true,is_active:false},
  ],
  student_clearances: [
    {id:'cl1',student_id:'s1',clearance_item_id:'i1',status:'cleared',approved_by:'incharge1',approved_at:'2026-10-12T09:00:00Z'},
    {id:'cl2',student_id:'s1',clearance_item_id:'i2',status:'not_applicable',approved_by:'incharge1',approved_at:'2026-10-12T09:00:00Z'},
    {id:'cl3',student_id:'s2',clearance_item_id:'i1',status:'pending',approved_by:null,approved_at:null},
    {id:'cl4',student_id:'s4',clearance_item_id:'i3',status:'cleared',approved_by:'incharge1',approved_at:'2026-10-12T09:00:00Z'},
    {id:'cl5',student_id:'s1',clearance_item_id:'i4',status:'pending',approved_by:null,approved_at:null},
    {id:'cl6',student_id:'s1',clearance_item_id:'i5',status:'pending',approved_by:null,approved_at:null},
  ],
};
export const placementFilters = {department_ids:[],graduation_years:[],company_ids:[],drive_ids:[],drive_start_from:null,drive_start_to:null,drive_statuses:[]};
export const noDuesFilters = {department_ids:[],graduation_years:[]};
export const expectedPlacement = {
  total_students:5,eligible_students:5,placed_students:2,unplaced_students:3,
  placement_rate:{numerator:2,denominator:5,percent:40},
  applications:5,successful_offers:3,students_with_multiple_offers:1,
  salary:{count:2,min_minor:10000000,max_minor:20000000,mean_minor:15000000,median_minor:15000000,currency:'INR'},
  by_department:[
    {department_id:'cse',department_code:'CSE',total_students:3,eligible_students:3,placed_students:1,unplaced_students:2,placement_rate:{numerator:1,denominator:3,percent:33.33},successful_offers:2},
    {department_id:'ece',department_code:'ECE',total_students:1,eligible_students:1,placed_students:1,unplaced_students:0,placement_rate:{numerator:1,denominator:1,percent:100},successful_offers:1},
    {department_id:'me',department_code:'ME',total_students:1,eligible_students:1,placed_students:0,unplaced_students:1,placement_rate:{numerator:0,denominator:1,percent:0},successful_offers:0},
  ],
};
export const expectedNoDues = {
  total_students:5,cleared_students:2,pending_students:2,not_configured_students:1,
  clearance_rate:{numerator:2,denominator:5,percent:40},
  mandatory_items:{cleared:2,not_applicable:1,pending:1,missing:3},
  by_department:[
    {department_id:'cse',department_code:'CSE',total_students:3,cleared_students:1,pending_students:2,not_configured_students:0,clearance_rate:{numerator:1,denominator:3,percent:33.33}},
    {department_id:'ece',department_code:'ECE',total_students:1,cleared_students:1,pending_students:0,not_configured_students:0,clearance_rate:{numerator:1,denominator:1,percent:100}},
    {department_id:'me',department_code:'ME',total_students:1,cleared_students:0,pending_students:0,not_configured_students:1,clearance_rate:{numerator:0,denominator:1,percent:0}},
  ],
};
export const importContext = {departments:fixture.departments,existing_students:fixture.students,min_graduation_year:2026,max_graduation_year:2030,max_rows:1000};
export const validImportRows = [
  {student_number:'006',full_name:' Demo Student Six ',email:' SIX@EXAMPLE.TEST ',department_code:' cse ',graduation_year:'2027',cgpa:'8.50',phone:'+91 90000 00006',backlogs:null},
  {student_number:'007',full_name:'Demo Student Seven',email:'seven@example.test',department_code:'ECE',graduation_year:'2028',cgpa:'',phone:''},
];
export const expectedNormalizedImportRows = [
  {student_number:'006',full_name:'Demo Student Six',email:'six@example.test',department_code:'CSE',graduation_year:2027,cgpa:8.5,phone:'+91 90000 00006',backlogs:null},
  {student_number:'007',full_name:'Demo Student Seven',email:'seven@example.test',department_code:'ECE',graduation_year:2028,cgpa:null,phone:null,backlogs:null},
];
