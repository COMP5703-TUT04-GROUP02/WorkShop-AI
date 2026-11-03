// iOS 27 will not launch an app built with its SDK unless the app adopts the
// UIScene life cycle; without it the app stops at launch with EXC_BREAKPOINT in
// _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption. Expo SDK 58's
// template adopts it, SDK 57's does not, so this plugin makes the same change:
// a scene manifest in Info.plist, a SceneDelegate that creates the window and
// starts React Native in it, and an AppDelegate that no longer does either.
// Drop it after upgrading to SDK 58 or later.
const fs = require("fs");
const path = require("path");
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const SCENE_DELEGATE_FILE = "SceneDelegate.swift";

const SCENE_DELEGATE = `import React
import UIKit

// Written by plugins/withIosSceneDelegate.js. iOS 27 needs the scene life
// cycle, so the window lives here and React Native starts in it.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    // A link that opens the app arrives with the scene rather than in the
    // launch options, so hand it on for Linking.getInitialURL().
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
  }

  // Links that arrive while the app is running go to the app delegate's
  // handlers, as they did before scenes.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = UIApplication.shared.delegate?.application?(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

// The window set-up that SDK 57's AppDelegate.swift does at launch.
const APP_DELEGATE_WINDOW =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;
const APP_DELEGATE_NOTE =
  "    // The window is created and React Native is started by SceneDelegate under\n" +
  "    // the scene life cycle that iOS 27 requires.\n";

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return config;
  });
}

function withWindowInScene(config) {
  return withAppDelegate(config, (config) => {
    const { contents } = config.modResults;
    if (contents.includes(APP_DELEGATE_NOTE)) return config;
    if (!APP_DELEGATE_WINDOW.test(contents)) {
      throw new Error(
        "withIosSceneDelegate: AppDelegate.swift no longer sets up its window the way Expo SDK 57 does; check whether this plugin is still needed.",
      );
    }
    config.modResults.contents = contents.replace(APP_DELEGATE_WINDOW, `\n${APP_DELEGATE_NOTE}`);
    return config;
  });
}

function withSceneDelegateFile(config) {
  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
      const target = path.join(config.modRequest.platformProjectRoot, projectName, SCENE_DELEGATE_FILE);
      fs.writeFileSync(target, SCENE_DELEGATE);
      return config;
    },
  ]);
  return withXcodeProject(config, (config) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    // Skips the file when the group already has it.
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: path.join(projectName, SCENE_DELEGATE_FILE),
      groupName: projectName,
      project: config.modResults,
    });
    return config;
  });
}

module.exports = function withIosSceneDelegate(config) {
  return withSceneDelegateFile(withWindowInScene(withSceneManifest(config)));
};
