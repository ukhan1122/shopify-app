export async function loader() {
  console.log('🔍 DEBUG ROUTE - Environment check:');
  console.log('BACKEND_URL:', process.env.BACKEND_URL);
  console.log('SHOPIFY_API_TOKEN exists:', !!process.env.SHOPIFY_API_TOKEN);
  
  return new Response(JSON.stringify({
    BACKEND_URL: process.env.BACKEND_URL,
    SHOPIFY_API_TOKEN_EXISTS: !!process.env.SHOPIFY_API_TOKEN
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export default function DebugEnv() {
  return <div>Check terminal for environment debug logs</div>;
}