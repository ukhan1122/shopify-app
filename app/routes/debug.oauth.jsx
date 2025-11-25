import { PrismaClient } from '@prisma/client';
import { authenticate } from "../shopify.server";
import { redirect } from "react-router";

const prisma = new PrismaClient();

export async function loader({ request }) {
  console.log('🔍 DEBUG OAUTH - Starting manual OAuth debug');
  
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  
  if (!shop) {
    return new Response('Shop parameter required', { status: 400 });
  }

  try {
    console.log('🔍 DEBUG OAUTH - Before authenticate.admin()');
    
    const { session } = await authenticate.admin(request);
    
    console.log('🔍 DEBUG OAUTH - Session after authenticate:');
    console.log('  Shop:', session.shop);
    console.log('  Token:', session.accessToken);
    console.log('  Token length:', session.accessToken?.length);
    console.log('  Session ID:', session.id);
    console.log('  Is Online:', session.isOnline);
    
    // Check what's actually in the database
    const dbSession = await prisma.session.findUnique({
      where: { shop: session.shop }
    });
    
    console.log('🔍 DEBUG OAUTH - Session from database:');
    console.log('  DB Token:', dbSession?.accessToken);
    console.log('  DB Token length:', dbSession?.accessToken?.length);
    
    return redirect('/app');
    
  } catch (error) {
    console.log('🔍 DEBUG OAUTH - Error:', error);
    return new Response(`OAuth Debug Error: ${error.message}`, { status: 500 });
  }
}

export default function DebugOAuth() {
  return <div>OAuth Debug Tool - Check console logs</div>;
}