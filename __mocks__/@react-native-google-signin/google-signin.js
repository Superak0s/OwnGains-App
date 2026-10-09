// The native TurboModule is missing under Jest, so importing the real package throws.
module.exports = {
  GoogleSignin: {
    configure: () => {},
    hasPlayServices: async () => true,
    signOut: async () => null,
    signIn: async () => ({ type: "cancelled", data: null }),
  },
}
