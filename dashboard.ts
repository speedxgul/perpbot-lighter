import { Database } from "bun:sqlite";

const db = new Database("trading.db", { readonly: true });

function getData() {
    const invocations = db.query(`
        SELECT id, account_name, invocation_count, collateral, available, open_positions, created_at
        FROM invocations ORDER BY created_at ASC
    `).all();

    const toolCalls = db.query(`
        SELECT tc.id, tc.invocation_id, tc.tool, tc.args, tc.result, tc.error, tc.created_at,
               i.invocation_count
        FROM tool_calls tc
        JOIN invocations i ON tc.invocation_id = i.id
        ORDER BY tc.created_at DESC LIMIT 200
    `).all();

    return { invocations, toolCalls };
}

const html = await Bun.file("dashboard.html").text();

Bun.serve({
    port: 3001,
    routes: {
        "/": () => new Response(html, { headers: { "Content-Type": "text/html" } }),

        "/api/data": {
            GET: () => Response.json(getData()),
        },

        "/api/stream": {
            GET: (req) => {
                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    start(controller) {
                        const send = () => {
                            try {
                                const payload = JSON.stringify(getData());
                                controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                            } catch { }
                        };

                        send();
                        const interval = setInterval(send, 5000);

                        req.signal.addEventListener("abort", () => {
                            clearInterval(interval);
                            try { controller.close(); } catch { }
                        });
                    },
                });

                return new Response(stream, {
                    headers: {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                    },
                });
            },
        },
    },
});

console.log("Dashboard → http://localhost:3001");
