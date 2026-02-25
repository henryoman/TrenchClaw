export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["trenchclaw-logo.png","trenchclaw-wordmark.png"]),
	mimeTypes: {".png":"image/png"},
	_: {
		client: {start:"_app/immutable/entry/start.BCMZEx9W.js",app:"_app/immutable/entry/app.B1Pn5O4E.js",imports:["_app/immutable/entry/start.BCMZEx9W.js","_app/immutable/chunks/uMFA6Rn5.js","_app/immutable/chunks/Cf1zhldJ.js","_app/immutable/chunks/lhFW1PAq.js","_app/immutable/entry/app.B1Pn5O4E.js","_app/immutable/chunks/Cf1zhldJ.js","_app/immutable/chunks/BrQ-ns4M.js","_app/immutable/chunks/C4o7FmYS.js","_app/immutable/chunks/lhFW1PAq.js","_app/immutable/chunks/DjFwbiln.js","_app/immutable/chunks/J_YLyXvo.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
