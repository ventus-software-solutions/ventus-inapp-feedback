export async function GET() {
  return Response.json(
    {
      message: "Synthetic upstream failure",
      safeForDemo: true,
    },
    { status: 503 },
  );
}
