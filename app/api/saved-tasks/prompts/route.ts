import { NextResponse } from "next/server";
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";
import { taskProject } from "@/lib/saved-tasks";
import { projectTrustReloadOptions } from "@/lib/project-trust";
import { uiRouteError } from "@/lib/web-ui-route";
export async function GET(req: Request) {
  try {
    const cwd = new URL(req.url).searchParams.get("cwd");
    await taskProject(cwd);
    if (!cwd) return NextResponse.json({ prompts: [] });
    const loader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
    await loader.reload(projectTrustReloadOptions(cwd, getAgentDir()));
    return NextResponse.json({ prompts: loader.getPrompts().prompts.map(p => ({ name: p.name, description: p.description, content: p.content, path: p.filePath })) });
  } catch (e) { return uiRouteError(e); }
}
