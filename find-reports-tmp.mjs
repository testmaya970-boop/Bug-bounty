import { createClient } from '@supabase/supabase-js';

const url = 'http://127.0.0.1:54321';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(url, key);

const { data: reports, error } = await supabase
  .from('reports')
  .select('id, title, status, confirmed_severity, organization_id, program_id, cvss_base_score')
  .order('created_at', { ascending: true });

if (error) {
  console.log('ERROR', error);
  process.exit(1);
}

// Find northwind org
const { data: orgs } = await supabase.from('organizations').select('id, name, slug').ilike('name', '%northwind%');
console.log('ORGS:', JSON.stringify(orgs));

const orgIds = (orgs || []).map(o => o.id);
const northwindReports = reports.filter(r => orgIds.includes(r.organization_id));
console.log('NORTHWIND REPORT COUNT:', northwindReports.length);
console.log(northwindReports.map(r => ({ id: r.id, title: r.title, status: r.status, sev: r.confirmed_severity, cvss: r.cvss_base_score })));
