import { createClient } from '@supabase/supabase-js';

const url = 'http://127.0.0.1:54321';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const supabase = createClient(url, key);

const ids = [
  'fb4fd1c7-bfdc-4a69-9c11-607f03357dab', // High/9.8 test
  'd525f92b-2d27-420c-a6a2-89ffa1f6a6ed', // Low test
  'ab01c39a-27cc-4833-97e0-f7f48172bfc9', // Control
];

const { data, error } = await supabase
  .from('reports')
  .select('id, title, status, confirmed_severity, cvss_base_score, cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope, cvss_confidentiality_impact, cvss_integrity_impact, cvss_availability_impact')
  .in('id', ids);

if (error) { console.log('ERR', error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
