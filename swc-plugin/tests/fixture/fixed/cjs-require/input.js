const { switchBuildCondition } = require('build-conditions');
const desktopImpl = require('./impl@desktop');
const mobileImpl = require('./impl@mobile');
module.exports = switchBuildCondition({
    desktop: desktopImpl,
    mobile: mobileImpl,
});
