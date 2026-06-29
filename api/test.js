// Test endpoint ultra-simple - ESM compatible
export default async function handler(req, res) {
  console.log('✅ Test endpoint called');
  res.json({ message: "Hello from Vercel!", success: true });
}
