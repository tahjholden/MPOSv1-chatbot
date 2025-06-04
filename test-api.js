#!/usr/bin/env node
/**
 * Test Script for MP Basketball generate-blocks API
 * 
 * This script tests the /api/generate-blocks endpoint by sending a sample request
 * with basketball coaching data and displaying the response.
 * 
 * Usage:
 *   1. Make sure your Next.js development server is running:
 *      npm run dev
 *   2. Run this script:
 *      node test-api.js
 *   
 *   Optional flags:
 *   --group=<group_id>    Specify a group ID (team)
 *   --coach=<coach_id>    Specify a coach ID
 *   --theme=<theme>       Specify a practice theme
 *   --date=<YYYY-MM-DD>   Specify a session date
 *   --verbose             Show full response details
 * 
 * Example:
 *   node test-api.js --theme="Shooting and Spacing" --coach="b7db439c-4ad4-40f4-8963-15e7f6d7d6c7"
 */

// Import dependencies - using native Node.js modules for v23+
import { parseArgs } from 'node:util';

// Parse command line arguments
const options = {
  group: { type: 'string' },
  coach: { type: 'string' },
  theme: { type: 'string' },
  date: { type: 'string' },
  verbose: { type: 'boolean', short: 'v' }
};

const { values } = parseArgs({ options });

// Configuration
const API_URL = 'http://localhost:3000/api/generate-blocks';
const DEFAULT_COACH_ID = 'b7db439c-4ad4-40f4-8963-15e7f6d7d6c7'; // From .env.local
const DEFAULT_GROUP_ID = '9ba6bbd3-85f6-4bba-b95d-5b79bd309df8'; // From .env.local

// Sample player IDs for attendance data (realistic UUIDs)
const SAMPLE_PLAYER_IDS = [
  '8ce6193d-3041-4f11-8c1d-a63d10d12569',
  '9f5e8d7c-6b3a-4c2d-9e1f-0a8b7c6d5e4f',
  'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  'd7e8f9a0-b1c2-3d4e-5f6a-7b8c9d0e1f2a',
  'e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b'
];

// Create sample request data
const requestData = {
  coach_id: values.coach || DEFAULT_COACH_ID,
  group_id: values.group || DEFAULT_GROUP_ID, // Using group_id instead of team_id
  theme: values.theme || 'Ball Movement and Spacing',
  session_date: values.date || new Date().toISOString().split('T')[0],
  collective_growth_phase: 3,
  attendance_data: SAMPLE_PLAYER_IDS.map(playerId => ({
    person_id: playerId,
    present: true
  }))
};

// Display test configuration
console.log('\n🏀 MP Basketball API Test - generate-blocks');
console.log('===========================================');
console.log('API Endpoint:', API_URL);
console.log('Request Data:');
console.log(JSON.stringify(requestData, null, 2));
console.log('\nSending request...');

// Make the API request
async function testGenerateBlocksAPI() {
  try {
    const startTime = Date.now();
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    
    const responseTime = Date.now() - startTime;
    
    // Check if the response is OK
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    // Parse the JSON response
    const data = await response.json();
    
    // Display success message
    console.log('\n✅ API Request Successful!');
    console.log(`Response time: ${responseTime}ms`);
    console.log('\nResponse Summary:');
    console.log('- Success:', data.success);
    console.log('- Message:', data.message);
    console.log('- Session ID:', data.session_id);
    console.log('- Status:', data.status);
    console.log('- DB Operation:', data.db_operation);
    
    // Check if session_plan exists and has the expected structure
    if (data.session_plan && Array.isArray(data.session_plan.session_plan)) {
      console.log('- Practice Blocks:', data.session_plan.session_plan.length);
      
      // Display detailed response if verbose mode is enabled
      if (values.verbose) {
        console.log('\nDetailed Response:');
        console.log(JSON.stringify(data, null, 2));
      } else {
        // Show first practice block if available
        if (data.session_plan.session_plan.length > 0) {
          console.log('\nFirst practice block:');
          console.log(JSON.stringify(data.session_plan.session_plan[0], null, 2));
        }
        console.log('\nTip: Run with --verbose or -v flag to see full response');
      }
    } else {
      console.warn('\n⚠️ Warning: Unexpected response structure - session_plan may be missing or malformed');
      console.log('\nResponse data:');
      console.log(JSON.stringify(data, null, 2));
    }
    
    return data;
  } catch (error) {
    console.error('\n❌ Error Testing API:');
    console.error(error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n⚠️ Connection refused. Make sure your Next.js server is running:');
      console.error('   npm run dev');
    } else if (error.message.includes('No attendance data available')) {
      console.error('\n⚠️ Attendance data error. Make sure player IDs exist in your database.');
      console.error('   Try using real player IDs from your person table.');
    } else if (error.message.includes('group_id')) {
      console.error('\n⚠️ Group ID error. Make sure the group_id exists in your group table.');
      console.error('   Try using a real group ID from your database.');
    }
    
    process.exit(1);
  }
}

// Run the test
testGenerateBlocksAPI().then(() => {
  console.log('\n🎯 Test completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Check your Supabase database for the new session');
  console.log('2. Verify the practice blocks were created');
  console.log('3. Test the approval workflow');
  console.log('\nTip: To use different parameters, try:');
  console.log(`   node test-api.js --group=<group_id> --coach=<coach_id> --theme="Defense Fundamentals"`);
});
