import type { EmitContext } from "@typespec/compiler";

export async function $onEmit(context: EmitContext) {
  if (context.program.compilerOptions.noEmit) {
    return;
  }
}
