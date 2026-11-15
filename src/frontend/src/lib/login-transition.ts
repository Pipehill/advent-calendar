type Credentials = { username: string; password: string };

// Each mounted form owns this coordinator. It retains only lifecycle flags,
// never credentials; a failed document navigation must not replay a login write.
export function createLoginTransition(
  authenticate: (input: Credentials) => Promise<unknown>,
  navigate: () => void,
) {
  let authenticated = false;
  let pending = false;
  return {
    get authenticated() {
      return authenticated;
    },
    async submit(input: Credentials, onNavigating: () => void) {
      if (pending) return;
      pending = true;
      try {
        if (!authenticated) {
          await authenticate(input);
          authenticated = true;
        }
        onNavigating();
        navigate();
      } catch (error) {
        pending = false;
        throw error;
      }
    },
  };
}
