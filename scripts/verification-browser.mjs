/** A verification browser may read the game, but must never edit shared choices. */
export async function isolatePersonalization(context) {
  await context.route('http://127.0.0.1:37654/preferences', (route) => route.fulfill({ status: 404, json: {} }));
}
