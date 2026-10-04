// Editor-only type stubs so VS Code's regular TypeScript checker understands
// the few Deno APIs these Edge Functions use. Not deployed, not executed.
// Real Deno (deploy / `supabase functions serve`) ignores this file.
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown
  namespace env {
    function get(key: string): string | undefined
  }
}

declare module 'qrcode' {
  const QRCode: {
    toDataURL(text: string, options?: Record<string, unknown>): Promise<string>
  }
  export default QRCode
}