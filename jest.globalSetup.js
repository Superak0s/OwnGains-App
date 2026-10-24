// Workers copy the parent's env at spawn, so TZ set inside a test file is ignored.
module.exports = () => {
  process.env.TZ ||= "Europe/Athens"
}
