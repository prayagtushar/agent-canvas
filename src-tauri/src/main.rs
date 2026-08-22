#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    // Same binary doubles as the Bus MCP server:
    //   agentic-canvas --bus-mcp <port> <token> <node_id>
    if args.len() >= 5 && args[1] == "--bus-mcp" {
        let port: u16 = args[2].parse().expect("bad port");
        agent_canvas_lib::mcp::run(port, args[3].clone(), args[4].clone());
        return;
    }
    agent_canvas_lib::run();
}
