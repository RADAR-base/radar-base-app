const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Build settings applied to every CocoaPods target, patched into the Podfile's `post_install`.
 *
 * Both settings here exist because of `ios.useFrameworks: "static"`, which React Native Firebase
 * requires and which changes how every other pod is compiled too.
 *
 * ## `IPHONEOS_DEPLOYMENT_TARGET`
 *
 * `platform :ios, '15.1'` only sets the floor for pods that don't state one. Pods that do — and their
 * generated resource-bundle targets in particular — keep whatever their podspec says, which across the
 * Firebase dependency chain is as old as iOS 9:
 *
 *     PromisesObjC-FBLPromises_Privacy            9.0
 *     nanopb-nanopb_Privacy                      12.0
 *     GoogleUtilities-GoogleUtilities_Privacy    12.0
 *     RNSVG-RNSVGFilters                         12.4
 *     RNCAsyncStorage-..._resources              13.4
 *
 * Xcode 27 refuses anything below 15.0, so each one fails the build. Those floors are stale podspec
 * metadata rather than real constraints, so lifting them is safe.
 *
 * ## `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES`
 *
 * Under static frameworks each pod becomes a framework module, and clang then rejects a module header
 * that includes a non-modular one — as an error, not a warning, because pods build with `-Werror`.
 * React Native Firebase's headers do exactly that with React's:
 *
 *     RNFBApp/RNFBAppModule.h:20      #import <React/RCTBridgeModule.h>
 *     RNFBApp/RCTConvert+FIRApp.h:19  #import <React/RCTConvert.h>
 *
 * The includes are correct; it's the framework packaging that makes them look wrong. Allowing them is
 * what React Native Firebase documents for static linkage.
 *
 * Distinct from {@link withGoogleUtilitiesModularHeaders}, which makes specific *Firebase* pods build
 * as modules so CocoaPods can link them statically at all. This one governs how every pod compiles
 * once that's done.
 *
 * `expo prebuild` regenerates ios/Podfile from scratch, so this re-injects on each run. Keep
 * `DEPLOYMENT_TARGET` in step with `platform :ios` in the Podfile (set by `expo-build-properties`'s
 * `ios.deploymentTarget`, defaulting to 15.1).
 */
const MARKER = 'PATCHED_POD_BUILD_SETTINGS';
const DEPLOYMENT_TARGET = '15.1';

const SNIPPET = `
    # ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < ${DEPLOYMENT_TARGET}
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${DEPLOYMENT_TARGET}'
        end
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end
    # Resource bundles are separate targets generated during installation, so they aren't in the loop
    # above and have to be lifted too — they are most of what Xcode complains about.
    installer.target_installation_results.pod_target_installation_results
      .each do |pod_name, target_installation_result|
      target_installation_result.resource_bundle_targets.each do |resource_bundle_target|
        resource_bundle_target.build_configurations.each do |config|
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${DEPLOYMENT_TARGET}'
        end
      end
    end
`;

module.exports = function withPodBuildSettings(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (!contents.includes(MARKER)) {
        // After `react_native_post_install`, which sets its own build settings — running before it
        // would have them overwritten.
        contents = contents.replace(
          /(react_native_post_install\(\n(?:.*\n)*?\s*\)\n)/,
          `$1${SNIPPET}`,
        );
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);
};
