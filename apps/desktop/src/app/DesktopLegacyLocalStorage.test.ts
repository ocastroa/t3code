import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";

import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLegacyLocalStorage from "./DesktopLegacyLocalStorage.ts";

it.effect("keeps legacy import reads within the local app profile", () => {
  const reads: string[] = [];
  const writes: string[] = [];
  const layerEnvironment = DesktopEnvironment.layer({
    dirname: "/repo/apps/desktop/dist-electron",
    homeDirectory: "/Users/alice",
    platform: "darwin",
    processArch: "arm64",
    appVersion: "0.0.45",
    appPath: "/app",
    isPackaged: true,
    resourcesPath: "/app/resources",
    runningUnderArm64Translation: false,
  }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({}))));
  return Effect.gen(function* () {
    const service = yield* DesktopLegacyLocalStorage.DesktopLegacyLocalStorage;
    yield* service.load("/profiles/t3code-local");
    assert.isTrue(Option.isNone(yield* service.take));
    assert.deepEqual(reads, [
      "/Users/alice/Library/Application Support/T3 Code (local)/Local Storage/leveldb",
    ]);
    assert.deepEqual(writes, ["/profiles/t3code-local/v1-local-storage-imported"]);
  }).pipe(
    Effect.provide(
      DesktopLegacyLocalStorage.layer.pipe(
        Layer.provide(layerEnvironment),
        Layer.provide(NodePath.layerPosix),
        Layer.provide(
          FileSystem.layerNoop({
            exists: () => Effect.succeed(false),
            readDirectory: (path) => {
              reads.push(path);
              return Effect.fail(
                PlatformError.systemError({
                  _tag: "NotFound",
                  module: "FileSystem",
                  method: "readDirectory",
                  pathOrDescriptor: path,
                }),
              );
            },
            writeFileString: (path) =>
              Effect.sync(() => {
                writes.push(path);
              }),
          }),
        ),
      ),
    ),
  );
});
