export async function runAfterReady(
  whenReady: () => Promise<void>,
  configure: () => void,
  create: () => Promise<void>,
) {
  await whenReady();
  configure();
  await create();
}
