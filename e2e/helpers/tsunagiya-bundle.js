var Tsunagiya = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if ((from && typeof from === 'object') || typeof from === 'function') {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, {
            get: () => from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
          });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, '__esModule', { value: true }), mod);

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/mod.js
  var mod_exports = {};
  __export(mod_exports, {
    AuthState: () => AuthState,
    Logger: () => Logger,
    MockPool: () => MockPool,
    MockRelay: () => MockRelay,
    WebSocketReadyState: () => WebSocketReadyState,
    classifyEvent: () => classifyEvent,
    createLogger: () => createLogger,
    filterEvents: () => filterEvents,
    generateChallenge: () => generateChallenge,
    getParameterizedId: () => getParameterizedId,
    isEphemeral: () => isEphemeral,
    isParameterizedReplaceable: () => isParameterizedReplaceable,
    isReplaceable: () => isReplaceable,
    matchFilter: () => matchFilter,
    matchFilters: () => matchFilters
  });

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/_dnt.shims.js
  var dntGlobals = {};
  var dntGlobalThis = createMergeProxy(globalThis, dntGlobals);
  function createMergeProxy(baseObj, extObj) {
    return new Proxy(baseObj, {
      get(_target, prop, _receiver) {
        if (prop in extObj) {
          return extObj[prop];
        } else {
          return baseObj[prop];
        }
      },
      set(_target, prop, value) {
        if (prop in extObj) {
          delete extObj[prop];
        }
        baseObj[prop] = value;
        return true;
      },
      deleteProperty(_target, prop) {
        let success = false;
        if (prop in extObj) {
          delete extObj[prop];
          success = true;
        }
        if (prop in baseObj) {
          delete baseObj[prop];
          success = true;
        }
        return success;
      },
      ownKeys(_target) {
        const baseKeys = Reflect.ownKeys(baseObj);
        const extKeys = Reflect.ownKeys(extObj);
        const extKeysSet = new Set(extKeys);
        return [...baseKeys.filter((k) => !extKeysSet.has(k)), ...extKeys];
      },
      defineProperty(_target, prop, desc) {
        if (prop in extObj) {
          delete extObj[prop];
        }
        Reflect.defineProperty(baseObj, prop, desc);
        return true;
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (prop in extObj) {
          return Reflect.getOwnPropertyDescriptor(extObj, prop);
        } else {
          return Reflect.getOwnPropertyDescriptor(baseObj, prop);
        }
      },
      has(_target, prop) {
        return prop in extObj || prop in baseObj;
      }
    });
  }

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/filter.js
  function matchFilter(event, filter) {
    if (filter.ids !== void 0 && filter.ids.length > 0) {
      if (!filter.ids.some((prefix) => event.id.startsWith(prefix))) {
        return false;
      }
    }
    if (filter.authors !== void 0 && filter.authors.length > 0) {
      if (!filter.authors.some((prefix) => event.pubkey.startsWith(prefix))) {
        return false;
      }
    }
    if (filter.kinds !== void 0 && filter.kinds.length > 0) {
      if (!filter.kinds.includes(event.kind)) {
        return false;
      }
    }
    if (filter.since !== void 0) {
      if (event.created_at < filter.since) {
        return false;
      }
    }
    if (filter.until !== void 0) {
      if (event.created_at > filter.until) {
        return false;
      }
    }
    if (filter.search !== void 0) {
      if (!event.content.toLowerCase().includes(filter.search.toLowerCase())) {
        return false;
      }
    }
    for (const key of Object.keys(filter)) {
      if (key.startsWith('#') && key.length >= 2) {
        const tagName = key.slice(1);
        const values = filter[key];
        if (values !== void 0 && values.length > 0) {
          const eventTagValues = event.tags
            .filter((tag) => tag[0] === tagName)
            .map((tag) => tag[1]);
          if (!values.some((v) => eventTagValues.includes(v))) {
            return false;
          }
        }
      }
    }
    return true;
  }
  function matchFilters(event, filters) {
    return filters.some((filter) => matchFilter(event, filter));
  }
  function filterEvents(events, filter) {
    const matched = events
      .filter((event) => matchFilter(event, filter))
      .sort((a, b) => b.created_at - a.created_at);
    if (filter.limit !== void 0 && filter.limit >= 0) {
      return matched.slice(0, filter.limit);
    }
    return matched;
  }

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/event_kind.js
  function classifyEvent(kind) {
    if (kind === 0 || kind === 3) return 'replaceable';
    if (kind >= 1e4 && kind < 2e4) return 'replaceable';
    if (kind >= 2e4 && kind < 3e4) return 'ephemeral';
    if (kind >= 3e4 && kind < 4e4) return 'parameterized_replaceable';
    return 'regular';
  }
  function isReplaceable(kind) {
    return kind === 0 || kind === 3 || (kind >= 1e4 && kind < 2e4);
  }
  function isEphemeral(kind) {
    return kind >= 2e4 && kind < 3e4;
  }
  function isParameterizedReplaceable(kind) {
    return kind >= 3e4 && kind < 4e4;
  }
  function getParameterizedId(event) {
    if (!isParameterizedReplaceable(event.kind)) return null;
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    return `${event.kind}:${event.pubkey}:${dTag}`;
  }

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/auth.js
  function generateChallenge() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  var AuthState = class {
    #validator = null;
    #challenges = /* @__PURE__ */ new Map();
    #authenticated = /* @__PURE__ */ new Set();
    /**
     * AUTHバリデーターを設定する
     */
    setValidator(validator) {
      this.#validator = validator;
    }
    /** バリデーターが設定されているか */
    get hasValidator() {
      return this.#validator !== null;
    }
    /**
     * 接続にAUTHチャレンジを送信する
     *
     * @returns チャレンジ文字列を含むAUTHメッセージ
     */
    sendChallenge(ws) {
      const challenge = generateChallenge();
      this.#challenges.set(ws, challenge);
      return ['AUTH', challenge];
    }
    /**
     * AUTH応答を検証する
     *
     * kind:22242 と challenge タグは常にチェックする。
     * カスタムバリデーター設定時はそれを呼び出し、
     * 未設定時は relay タグの URL 一致を標準チェックする。
     *
     * @returns [accepted, message] - 認証結果
     */
    async handleAuthResponse(ws, authEvent, relayUrl) {
      const challenge = this.#challenges.get(ws);
      if (!challenge) {
        return [false, 'auth-required: no challenge issued'];
      }
      if (authEvent.kind !== 22242) {
        return [false, 'auth-required: invalid auth event kind'];
      }
      const challengeTag = authEvent.tags.find((t) => t[0] === 'challenge' && t[1] === challenge);
      if (!challengeTag) {
        return [false, 'auth-required: challenge mismatch'];
      }
      if (this.#validator) {
        const context = { relayUrl, challenge };
        const valid = await this.#validator(authEvent, context);
        if (!valid) {
          return [false, 'auth-required: validation failed'];
        }
      } else {
        const relayTag = authEvent.tags.find((t) => t[0] === 'relay' && t[1] === relayUrl);
        if (!relayTag) {
          return [false, 'auth-required: relay URL mismatch'];
        }
      }
      this.#challenges.delete(ws);
      this.#authenticated.add(ws);
      return [true, ''];
    }
    /** 接続が認証済みか */
    isAuthenticated(ws) {
      return this.#authenticated.has(ws);
    }
    /** 接続のAUTH状態をクリアする */
    removeConnection(ws) {
      this.#challenges.delete(ws);
      this.#authenticated.delete(ws);
    }
    /** 全状態をリセットする */
    reset() {
      this.#validator = null;
      this.#challenges.clear();
      this.#authenticated.clear();
    }
  };

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/logger.js
  var LOG_LEVEL_PRIORITY = {
    silent: 0,
    error: 1,
    info: 2,
    debug: 3,
    trace: 4
  };
  var Logger = class {
    #level;
    #handler;
    #entries = [];
    constructor(level = 'info', handler) {
      this.#level = level;
      this.#handler = handler ?? null;
    }
    /** 現在のログレベル */
    get level() {
      return this.#level;
    }
    /** ログレベルを変更する */
    setLevel(level) {
      this.#level = level;
    }
    /** カスタムハンドラーを設定する */
    setHandler(handler) {
      this.#handler = handler;
    }
    /** 蓄積されたログエントリ */
    get entries() {
      return this.#entries;
    }
    /** ログエントリをクリアする */
    clear() {
      this.#entries = [];
    }
    /**
     * ログを記録する
     *
     * @param entry ログエントリ
     * @param entryLevel このエントリのログレベル
     */
    log(entry, entryLevel = 'debug') {
      if (this.#level === 'silent') return;
      if (LOG_LEVEL_PRIORITY[entryLevel] > LOG_LEVEL_PRIORITY[this.#level]) {
        return;
      }
      this.#entries.push(entry);
      if (this.#handler) {
        this.#handler(entry);
      } else {
        this.#consoleLog(entry);
      }
    }
    #consoleLog(entry) {
      const arrow = entry.direction === 'send' ? '\u2192' : '\u2190';
      const label = entry.direction === 'send' ? 'SEND' : 'RECV';
      const time = new Date(entry.timestamp).toISOString();
      const data = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data);
      console.log(`[${time}] ${arrow} ${label} ${entry.relay}: ${data}`);
    }
  };
  function createLogger(logging, level = 'info') {
    if (logging === void 0 || logging === false) return null;
    if (logging === true) {
      return new Logger(level);
    }
    return new Logger(level, logging);
  }

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/relay.js
  var MockRelay = class {
    url;
    options;
    #store = [];
    #received = [];
    #connections = /* @__PURE__ */ new Set();
    #info = {};
    #subscriptions = /* @__PURE__ */ new Map();
    #reqHandler = null;
    #eventHandler = null;
    #countHandler = null;
    #refused = false;
    #authState = new AuthState();
    #pendingTimers = /* @__PURE__ */ new Set();
    #logger = null;
    #errors = [];
    #authResults = [];
    #deletedIds = /* @__PURE__ */ new Set();
    #verifier = null;
    constructor(url, options = {}) {
      this.url = url;
      this.options = options;
      this.#logger = createLogger(options.logging);
      if (options.verifier) {
        this.#verifier = options.verifier;
      }
    }
    // ===== NIP-11 リレー情報 =====
    /**
     * NIP-11 リレー情報をマージ設定する
     *
     * 既存の情報とマージする（シャロウマージ）。
     * fetch インターセプト経由で `Accept: application/nostr+json` リクエストに返される。
     */
    setInfo(info) {
      this.#info = { ...this.#info, ...info };
    }
    /**
     * NIP-11 リレー情報のシャロウコピーを返す
     */
    getInfo() {
      return { ...this.#info };
    }
    // ===== ストア・ハンドラー =====
    /**
     * イベントをストアに登録する
     *
     * REQ受信時の自動マッチングに使用される。
     * NIP-01/NIP-16 に基づき、イベント種別に応じた処理を行う:
     * - Regular: 通常通り追加
     * - Replaceable: 同一 kind+pubkey の古いイベントを削除し追加（古い場合は無視）
     * - Ephemeral: ストアに追加しない
     * - Parameterized Replaceable: 同一 kind+pubkey+d-tag の古いイベントを削除し追加
     *
     * ブロードキャストは行わない。サブスクリプションへの配信が必要な場合は
     * {@link broadcast} を別途呼び出すこと。
     *
     * @param event ストアに登録するイベント
     * @returns ストアに追加された場合 true、無視された場合 false
     * @example
     * ```ts
     * const relay = pool.relay("wss://relay.example.com");
     * const event = EventBuilder.kind1().content("hello").build();
     * relay.store(event);
     * ```
     */
    store(event) {
      if (event.kind === 5) {
        this.#handleDeletion(event);
        this.#store.push(event);
        return true;
      }
      const { stored } = this.#classifyAndStore(event);
      return stored;
    }
    /**
     * REQハンドラーを設定する
     *
     * 設定すると自動マッチングがスキップされ、このハンドラーが呼ばれる。
     */
    onREQ(handler) {
      this.#reqHandler = handler;
    }
    /**
     * EVENTハンドラーを設定する
     *
     * クライアントからEVENTメッセージを受信したときの処理をカスタマイズする。
     * 署名検証（NIP-01）を行う場合はこのハンドラー内で独自に実装する。
     * 未設定の場合、署名検証は行わずストアへの保存とブロードキャストのみ行う。
     */
    onEVENT(handler) {
      this.#eventHandler = handler;
    }
    /**
     * COUNTハンドラーを設定する
     *
     * クライアントからCOUNTメッセージを受信したときの処理をカスタマイズする。
     * 未設定の場合、ストアに対してフィルタリングし、マッチ数を返す。
     */
    onCOUNT(handler) {
      this.#countHandler = handler;
    }
    // ===== エラーケース =====
    /**
     * 接続拒否モードにする
     *
     * 以降の新規接続はすべてエラーで閉じられる。
     */
    refuse() {
      this.#refused = true;
    }
    /**
     * 全接続を即座に切断する
     *
     * @param code WebSocketクローズコード (デフォルト: 1000)
     * @param reason クローズ理由
     */
    disconnect(code = 1e3, reason = '') {
      for (const ws of [...this.#connections]) {
        ws._forceClose(code, reason);
      }
    }
    /**
     * 指定時間後に全接続を切断する
     *
     * @param ms 遅延ミリ秒
     * @param code WebSocketクローズコード (デフォルト: 1006)
     */
    disconnectAfter(ms, code = 1006) {
      const timer = setTimeout(() => {
        this.#pendingTimers.delete(timer);
        this.disconnect(code, '');
      }, ms);
      this.#pendingTimers.add(timer);
    }
    /**
     * 特定のクローズコードで全接続を閉じる
     *
     * @param code WebSocketクローズコード
     */
    close(code) {
      this.disconnect(code, '');
    }
    /**
     * 生データを全接続に送信する
     *
     * 不正JSONのテスト等に使用する。
     */
    sendRaw(data) {
      for (const ws of this.#connections) {
        ws._receiveMessage(data);
      }
    }
    /**
     * NOTICEメッセージを全接続に送信する
     */
    sendNotice(message) {
      const notice = ['NOTICE', message];
      for (const ws of this.#connections) {
        ws._receiveMessage(JSON.stringify(notice));
      }
    }
    // ===== NIP-42 AUTH =====
    /**
     * AUTH要求を設定する
     *
     * バリデーターを設定すると、接続時にAUTHチャレンジが送信される。
     * 既存の接続にも即座にチャレンジが送信される。
     *
     * 標準検証（バリデーター未設定時）は kind:22242・challenge タグ・
     * relay タグの URL 一致のみを確認する。
     * カスタムバリデーターを設定すると relay URL チェックを置き換え、
     * context から relayUrl や challenge を参照して独自の検証を実装できる。
     */
    requireAuth(validator) {
      this.#authState.setValidator(validator);
      for (const ws of this.#connections) {
        const msg = this.#authState.sendChallenge(ws);
        ws._receiveMessage(JSON.stringify(msg));
      }
    }
    /**
     * イベント署名検証器を設定する
     *
     * 設定すると、クライアントから受信した EVENT メッセージの署名を検証する。
     * 検証に失敗した場合は OK false を返し、ストアへの保存とブロードキャストはスキップされる。
     */
    setVerifier(verifier) {
      this.#verifier = verifier;
    }
    // ===== 検証ヘルパー =====
    /**
     * 現在のアクティブサブスクリプション一覧を返す
     *
     * 全接続のサブスクリプションを集約し、subId → filters の
     * 読み取り専用ビューを提供する。同じ subId が複数接続にある場合は
     * 最初に見つかったものを使う。
     *
     * @example
     * ```ts
     * const subs = relay.getSubscriptions();
     * for (const [subId, filters] of subs) {
     *   console.log(`${subId}: ${JSON.stringify(filters)}`);
     * }
     * ```
     */
    getSubscriptions() {
      const result = /* @__PURE__ */ new Map();
      for (const subscriptions of this.#subscriptions.values()) {
        for (const [subId, filters] of subscriptions) {
          if (!result.has(subId)) {
            result.set(subId, [...filters]);
          }
        }
      }
      return result;
    }
    /** 全受信メッセージ（パース済み） */
    get received() {
      return this.#received.map((r) => r.message);
    }
    /**
     * 特定サブスクリプションIDのREQを検索する
     * @returns [subId, ...filters] または undefined
     */
    findREQ(subId) {
      const found = this.#received.find((r) => r.message[0] === 'REQ' && r.message[1] === subId);
      if (found && found.message[0] === 'REQ') {
        return found.message;
      }
      return void 0;
    }
    /** REQメッセージの受信数 */
    countREQs() {
      return this.#received.filter((r) => r.message[0] === 'REQ').length;
    }
    /** 特定サブスクリプションIDのREQが存在するか */
    hasREQ(subId) {
      return this.findREQ(subId) !== void 0;
    }
    /**
     * 特定イベントIDのEVENTを検索する
     * @returns イベント または undefined
     */
    findEvent(eventId) {
      const found = this.#received.find(
        (r) => r.message[0] === 'EVENT' && r.message[1].id === eventId
      );
      if (found && found.message[0] === 'EVENT') {
        return found.message[1];
      }
      return void 0;
    }
    /** EVENTメッセージの受信数 */
    countEvents() {
      return this.#received.filter((r) => r.message[0] === 'EVENT').length;
    }
    /** 特定イベントIDのEVENTが存在するか */
    hasEvent(eventId) {
      return this.findEvent(eventId) !== void 0;
    }
    /**
     * 特定サブスクリプションIDのCLOSEを検索する
     * @returns ["CLOSE", subId] または undefined
     */
    findCLOSE(subId) {
      const found = this.#received.find((r) => r.message[0] === 'CLOSE' && r.message[1] === subId);
      if (found && found.message[0] === 'CLOSE') {
        return found.message;
      }
      return void 0;
    }
    /**
     * 特定サブスクリプションIDのCOUNTを検索する
     * @returns ["COUNT", subId, ...filters] または undefined
     */
    findCOUNT(subId) {
      const found = this.#received.find((r) => r.message[0] === 'COUNT' && r.message[1] === subId);
      if (found && found.message[0] === 'COUNT') {
        return found.message;
      }
      return void 0;
    }
    /** COUNTメッセージの受信数 */
    countCOUNTs() {
      return this.#received.filter((r) => r.message[0] === 'COUNT').length;
    }
    /** 特定サブスクリプションIDのCOUNTが存在するか */
    hasCOUNT(subId) {
      return this.findCOUNT(subId) !== void 0;
    }
    /** 削除済みイベントIDの一覧 */
    get deletedIds() {
      return this.#deletedIds;
    }
    /** 現在のアクティブ接続数 */
    get connectionCount() {
      return this.#connections.size;
    }
    /** 発生したエラーレスポンスのログ */
    get errors() {
      return this.#errors;
    }
    /** AUTH認証結果のログ */
    get authResults() {
      return this.#authResults;
    }
    /** ロガーインスタンス（設定済みの場合） */
    get logger() {
      return this.#logger;
    }
    // ===== スナップショット =====
    /**
     * リレーの現在の状態を保存する
     *
     * ストアと受信メッセージのスナップショットを作成する。
     * 接続状態やハンドラーは保存されない。
     */
    snapshot() {
      return {
        timestamp: Date.now(),
        store: this.#store.map((e) => ({
          ...e,
          tags: e.tags.map((t) => [...t])
        })),
        received: this.#received.map((r) => {
          const msg = r.message;
          if (msg[0] === 'EVENT') {
            const event = { ...msg[1], tags: msg[1].tags.map((t) => [...t]) };
            return ['EVENT', event];
          }
          if (msg[0] === 'REQ' || msg[0] === 'COUNT') {
            const [type, subId, ...filters] = msg;
            return [type, subId, ...filters.map((f) => structuredClone(f))];
          }
          return [...msg];
        }),
        deletedIds: [...this.#deletedIds],
        info: { ...this.#info },
        metadata: {
          subscriptionCount: this.getSubscriptions().size,
          connectionCount: this.#connections.size,
          eventCount: this.#store.length
        }
      };
    }
    /**
     * スナップショットからリレーの状態を復元する
     *
     * ストアと受信メッセージログを復元する。
     * 接続やハンドラーは変更されない。
     */
    restore(snap) {
      this.#store = snap.store.map((e) => ({
        ...e,
        tags: e.tags.map((t) => [...t])
      }));
      this.#received = snap.received.map((msg) => ({
        timestamp: snap.timestamp,
        message:
          msg[0] === 'EVENT'
            ? [
                'EVENT',
                {
                  ...msg[1],
                  tags: msg[1].tags.map((t) => [...t])
                }
              ]
            : msg[0] === 'REQ' || msg[0] === 'COUNT'
              ? (() => {
                  const [type, subId, ...filters] = msg;
                  return [type, subId, ...filters.map((f) => structuredClone(f))];
                })()
              : [...msg],
        socket: null
      }));
      this.#deletedIds = new Set(snap.deletedIds ?? []);
      this.#info = snap.info ? { ...snap.info } : {};
    }
    /**
     * 指定タイムスタンプより古いイベントをストアから削除する
     *
     * 大量イベント時のメモリ最適化用。
     *
     * @param timestamp UNIXタイムスタンプ (秒)。これより古い created_at のイベントが削除される
     * @returns 削除されたイベント数
     * @example
     * ```ts
     * // 1時間以上前のイベントを削除
     * const cutoff = Math.floor(Date.now() / 1000) - 3600;
     * const deleted = relay.clearOlderThan(cutoff);
     * console.log(`${deleted} events removed`);
     * ```
     */
    clearOlderThan(timestamp) {
      const before = this.#store.length;
      this.#store = this.#store.filter((e) => e.created_at >= timestamp);
      return before - this.#store.length;
    }
    /**
     * リレーの状態をリセットする
     *
     * ストア、受信ログ、サブスクリプション、ハンドラー、AUTH状態をクリアする。
     */
    reset() {
      this.#store = [];
      this.#received = [];
      this.#subscriptions.clear();
      this.#reqHandler = null;
      this.#eventHandler = null;
      this.#countHandler = null;
      this.#refused = false;
      this.#authState.reset();
      this.#errors = [];
      this.#authResults = [];
      this.#deletedIds.clear();
      this.#info = {};
      this.#verifier = null;
      for (const timer of this.#pendingTimers) {
        clearTimeout(timer);
      }
      this.#pendingTimers.clear();
    }
    // ===== internal API =====
    /**
     * 接続拒否モードかどうか
     * @internal MockWebSocketから呼び出される
     */
    get _isRefused() {
      return this.#refused;
    }
    /**
     * 接続を登録する
     * @internal MockWebSocketから呼び出される
     */
    _registerConnection(ws) {
      this.#connections.add(ws);
    }
    /**
     * 接続を解除する
     * @internal MockWebSocketから呼び出される
     */
    _unregisterConnection(ws) {
      this.#connections.delete(ws);
      this.#authState.removeConnection(ws);
      this.#subscriptions.delete(ws);
    }
    /**
     * イベントをアクティブなサブスクリプションにブロードキャストする
     *
     * イベントを各サブスクリプションのフィルターと照合し、
     * マッチした場合にそのサブスクリプションへ送信する。
     *
     * ストアへの保存は行わない。保存が必要な場合は {@link store} を別途呼び出すこと。
     *
     * @param event ブロードキャストするイベント
     * @example
     * ```ts
     * const event = EventBuilder.kind1().content("hello").build();
     * relay.store(event);
     * relay.broadcast(event);
     * ```
     */
    broadcast(event) {
      for (const [ws, subscriptions] of this.#subscriptions) {
        for (const [subId, filters] of subscriptions) {
          if (matchFilters(event, filters)) {
            const msg = ['EVENT', subId, event];
            ws._receiveMessage(JSON.stringify(msg));
          }
        }
      }
    }
    /**
     * WebSocket接続確立後の処理
     * @internal MockWebSocketから呼び出される
     */
    _handleOpen(ws) {
      if (this.options.requiresAuth || this.#authState.hasValidator) {
        const timer = setTimeout(() => {
          this.#pendingTimers.delete(timer);
          const msg = this.#authState.sendChallenge(ws);
          ws._receiveMessage(JSON.stringify(msg));
        }, 0);
        this.#pendingTimers.add(timer);
      }
    }
    /**
     * クライアントからのメッセージを処理する
     * @internal MockWebSocketから呼び出される
     */
    _handleMessage(ws, data) {
      let parsed;
      try {
        const raw = JSON.parse(data);
        if (!Array.isArray(raw) || raw.length < 1) {
          this.#errors.push('error: invalid message format');
          this.#log('receive', data, 'error');
          const notice = ['NOTICE', 'error: invalid message format'];
          this.#sendWithLatency(ws, notice);
          return;
        }
        const type = raw[0];
        if (type === 'EVENT') {
          const ev = raw[1];
          if (
            raw.length < 2 ||
            typeof raw[1] !== 'object' ||
            raw[1] === null ||
            typeof ev.id !== 'string' ||
            typeof ev.pubkey !== 'string' ||
            typeof ev.created_at !== 'number' ||
            typeof ev.kind !== 'number' ||
            !Array.isArray(ev.tags) ||
            typeof ev.content !== 'string' ||
            typeof ev.sig !== 'string'
          ) {
            this.#errors.push('error: malformed EVENT message');
            const notice = ['NOTICE', 'error: malformed EVENT message'];
            this.#sendWithLatency(ws, notice);
            return;
          }
        } else if (type === 'REQ' || type === 'COUNT') {
          if (raw.length < 2 || typeof raw[1] !== 'string') {
            this.#errors.push(`error: malformed ${type} message`);
            const notice = ['NOTICE', `error: malformed ${type} message`];
            this.#sendWithLatency(ws, notice);
            return;
          }
          if (raw.length < 3) {
            this.#errors.push(`error: ${type} requires at least one filter`);
            const notice = ['NOTICE', `error: ${type} requires at least one filter`];
            this.#sendWithLatency(ws, notice);
            return;
          }
          for (let i = 2; i < raw.length; i++) {
            if (typeof raw[i] !== 'object' || raw[i] === null || Array.isArray(raw[i])) {
              this.#errors.push(`error: ${type} filter[${i - 2}] must be an object`);
              const notice = ['NOTICE', `error: ${type} filter[${i - 2}] must be an object`];
              this.#sendWithLatency(ws, notice);
              return;
            }
          }
        } else if (type === 'CLOSE') {
          if (raw.length < 2 || typeof raw[1] !== 'string') {
            this.#errors.push('error: malformed CLOSE message');
            const notice = ['NOTICE', 'error: malformed CLOSE message'];
            this.#sendWithLatency(ws, notice);
            return;
          }
        } else if (type === 'AUTH') {
          if (raw.length < 2 || typeof raw[1] !== 'object' || raw[1] === null) {
            this.#errors.push('error: malformed AUTH message');
            const notice = ['NOTICE', 'error: malformed AUTH message'];
            this.#sendWithLatency(ws, notice);
            return;
          }
        }
        parsed = raw;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const msg = `error: invalid JSON (${detail})`;
        this.#errors.push(msg);
        this.#log('receive', data, 'error');
        const notice = ['NOTICE', msg];
        this.#sendWithLatency(ws, notice);
        return;
      }
      this.#received.push({
        timestamp: Date.now(),
        message: parsed,
        socket: ws
      });
      this.#log('receive', parsed);
      if (this.#shouldRandomDisconnect()) {
        ws._forceClose(1006, 'Random disconnect');
        return;
      }
      if (this.#shouldError()) {
        const msg = 'error: simulated error';
        const notice = ['NOTICE', msg];
        this.#errors.push(msg);
        this.#sendWithLatency(ws, notice);
        return;
      }
      if (this.#requiresAuthentication() && !this.#authState.isAuthenticated(ws)) {
        if (parsed[0] === 'EVENT') {
          const msg = 'auth-required: authentication required';
          const ok = ['OK', parsed[1].id, false, msg];
          this.#errors.push(msg);
          this.#sendWithLatency(ws, ok);
          return;
        }
        if (parsed[0] === 'REQ') {
          const msg = 'auth-required: authentication required';
          const closed = ['CLOSED', parsed[1], msg];
          this.#errors.push(msg);
          this.#sendWithLatency(ws, closed);
          return;
        }
      }
      switch (parsed[0]) {
        case 'EVENT':
          this.#handleEvent(ws, parsed[1]).catch((err) => {
            const msg = `error: ${err instanceof Error ? err.message : String(err)}`;
            this.#errors.push(msg);
          });
          break;
        case 'REQ':
          this.#handleReq(ws, parsed[1], parsed.slice(2)).catch((err) => {
            const msg = `error: ${err instanceof Error ? err.message : String(err)}`;
            this.#errors.push(msg);
          });
          break;
        case 'CLOSE':
          this.#handleClose(ws, parsed[1]);
          break;
        case 'AUTH':
          this.#handleAuth(ws, parsed[1]).catch((err) => {
            const msg = `error: ${err instanceof Error ? err.message : String(err)}`;
            this.#errors.push(msg);
          });
          break;
        case 'COUNT':
          this.#handleCount(ws, parsed[1], parsed.slice(2)).catch((err) => {
            const msg = `error: ${err instanceof Error ? err.message : String(err)}`;
            this.#errors.push(msg);
          });
          break;
        default: {
          const msg = `error: unsupported message type: ${String(parsed[0])}`;
          this.#errors.push(msg);
          const notice = ['NOTICE', msg];
          this.#sendWithLatency(ws, notice);
          break;
        }
      }
    }
    async #handleEvent(ws, event) {
      let response;
      if (this.#verifier) {
        const valid = await this.#verifier.verifyEvent(event);
        if (!valid) {
          const msg = 'invalid: bad signature';
          this.#errors.push(msg);
          const ok = ['OK', event.id, false, msg];
          this.#sendWithLatency(ws, ok);
          return;
        }
      }
      try {
        if (this.#eventHandler) {
          response = await this.#eventHandler(event);
        } else {
          if (this.#deletedIds.has(event.id)) {
            response = ['OK', event.id, false, 'blocked: event was deleted'];
          } else if (event.kind === 5) {
            this.#handleDeletion(event);
            this.#store.push(event);
            this.broadcast(event);
            response = ['OK', event.id, true, ''];
          } else {
            const { stored, ephemeral } = this.#classifyAndStore(event);
            if (stored || ephemeral) {
              this.broadcast(event);
              response = ['OK', event.id, true, ''];
            } else {
              response = ['OK', event.id, true, 'duplicate: already have a newer event'];
            }
          }
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        response = ['OK', event.id, false, `error: internal error processing EVENT (${detail})`];
      }
      if (!response[2] && response[3]) {
        this.#errors.push(response[3]);
      }
      this.#sendWithLatency(ws, response);
    }
    async #handleReq(ws, subId, filters) {
      let wsSubscriptions = this.#subscriptions.get(ws);
      if (!wsSubscriptions) {
        wsSubscriptions = /* @__PURE__ */ new Map();
        this.#subscriptions.set(ws, wsSubscriptions);
      }
      wsSubscriptions.set(subId, filters);
      try {
        let events;
        if (this.#reqHandler) {
          events = await this.#reqHandler(subId, filters);
        } else {
          events = [];
          const seen = /* @__PURE__ */ new Set();
          for (const filter of filters) {
            const matched = filterEvents(this.#store, filter);
            for (const event of matched) {
              if (!seen.has(event.id)) {
                seen.add(event.id);
                events.push(event);
              }
            }
          }
        }
        for (const event of events) {
          const msg = ['EVENT', subId, event];
          this.#sendWithLatency(ws, msg);
        }
        const eose = ['EOSE', subId];
        this.#sendWithLatency(ws, eose);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const msg = `error: internal error processing REQ (${detail})`;
        this.#errors.push(msg);
        const closed = ['CLOSED', subId, msg];
        this.#sendWithLatency(ws, closed);
      }
    }
    #handleClose(ws, subId) {
      this.#subscriptions.get(ws)?.delete(subId);
    }
    async #handleAuth(ws, authEvent) {
      try {
        const [accepted, message] = await this.#authState.handleAuthResponse(
          ws,
          authEvent,
          this.url
        );
        this.#authResults.push({ eventId: authEvent.id, accepted, message });
        const ok = ['OK', authEvent.id, accepted, message];
        this.#sendWithLatency(ws, ok);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const msg = `error: internal error processing AUTH (${detail})`;
        this.#errors.push(msg);
        const ok = ['OK', authEvent.id, false, msg];
        this.#sendWithLatency(ws, ok);
      }
    }
    #handleDeletion(deletionEvent) {
      const idsToDelete = /* @__PURE__ */ new Set();
      for (const tag of deletionEvent.tags) {
        if (tag[0] === 'e' && tag[1]) {
          const targetId = tag[1];
          const target = this.#store.find((e) => e.id === targetId);
          if (
            target &&
            target.pubkey === deletionEvent.pubkey &&
            target.created_at <= deletionEvent.created_at
          ) {
            idsToDelete.add(targetId);
          }
        }
        if (tag[0] === 'a' && tag[1]) {
          const parts = tag[1].split(':');
          if (parts.length >= 3) {
            const aKind = parseInt(parts[0], 10);
            if (isNaN(aKind)) continue;
            const aPubkey = parts[1];
            const aDtag = parts.slice(2).join(':');
            if (aPubkey === deletionEvent.pubkey) {
              const target = this.#store.find((e) => {
                if (
                  e.kind === aKind &&
                  e.pubkey === aPubkey &&
                  e.created_at <= deletionEvent.created_at &&
                  isParameterizedReplaceable(e.kind)
                ) {
                  const dValue = e.tags.find((t) => t[0] === 'd')?.[1] ?? '';
                  return dValue === aDtag;
                }
                if (
                  e.kind === aKind &&
                  e.pubkey === aPubkey &&
                  e.created_at <= deletionEvent.created_at &&
                  isReplaceable(e.kind)
                ) {
                  return true;
                }
                return false;
              });
              if (target) {
                idsToDelete.add(target.id);
              }
            }
          }
        }
      }
      if (idsToDelete.size > 0) {
        for (const id of idsToDelete) {
          this.#deletedIds.add(id);
        }
        this.#store = this.#store.filter((e) => !idsToDelete.has(e.id));
      }
    }
    async #handleCount(ws, subId, filters) {
      try {
        let result;
        if (this.#countHandler) {
          result = await this.#countHandler(subId, filters);
        } else {
          const matchedIds = /* @__PURE__ */ new Set();
          for (const filter of filters) {
            const matched = filterEvents(this.#store, filter);
            for (const event of matched) {
              matchedIds.add(event.id);
            }
          }
          result = { count: matchedIds.size };
        }
        const msg = ['COUNT', subId, result];
        this.#sendWithLatency(ws, msg);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const msg = `error: internal error processing COUNT (${detail})`;
        this.#errors.push(msg);
        const notice = ['NOTICE', msg];
        this.#sendWithLatency(ws, notice);
      }
    }
    // ===== イベント種別判定・ストア =====
    #replaceEvent(event, predicate) {
      const idx = this.#store.findIndex(predicate);
      if (idx !== -1) {
        const existing = this.#store[idx];
        if (event.created_at < existing.created_at) {
          return { stored: false, ephemeral: false };
        }
        if (event.created_at === existing.created_at && event.id >= existing.id) {
          return { stored: false, ephemeral: false };
        }
        this.#store.splice(idx, 1);
      }
      this.#store.push(event);
      return { stored: true, ephemeral: false };
    }
    /**
     * イベント種別に応じてストアに追加・置換する
     *
     * Ephemeral イベントはストアに追加しない（呼び出し側でブロードキャストする）。
     * Replaceable/Parameterized Replaceable は同一キーの古いイベントを置換する。
     *
     * @returns stored: ストアに追加されたか、ephemeral: ephemeral イベントか
     */
    #classifyAndStore(event) {
      if (this.#deletedIds.has(event.id)) {
        return { stored: false, ephemeral: false };
      }
      const kind = classifyEvent(event.kind);
      if (kind === 'ephemeral') {
        return { stored: false, ephemeral: true };
      }
      if (kind === 'replaceable') {
        return this.#replaceEvent(event, (e) => e.kind === event.kind && e.pubkey === event.pubkey);
      }
      if (kind === 'parameterized_replaceable') {
        const newParamId = getParameterizedId(event);
        return this.#replaceEvent(event, (e) => getParameterizedId(e) === newParamId);
      }
      this.#store.push(event);
      return { stored: true, ephemeral: false };
    }
    // ===== 認証チェック =====
    #requiresAuthentication() {
      return this.options.requiresAuth === true || this.#authState.hasValidator;
    }
    // ===== レイテンシ・不安定性 =====
    #getLatency() {
      const latency = this.options.latency;
      if (latency === void 0) return 0;
      if (typeof latency === 'number') return latency;
      return latency.min + Math.random() * (latency.max - latency.min);
    }
    #shouldError() {
      const rate = this.options.errorRate;
      if (rate === void 0 || rate <= 0) return false;
      return Math.random() < rate;
    }
    #shouldRandomDisconnect() {
      const rate = this.options.disconnectRate;
      if (rate === void 0 || rate <= 0) return false;
      return Math.random() < rate;
    }
    #sendWithLatency(ws, message) {
      const latency = this.#getLatency();
      const json = JSON.stringify(message);
      this.#log('send', message);
      if (latency > 0) {
        const timer = setTimeout(() => {
          this.#pendingTimers.delete(timer);
          ws._receiveMessage(json);
        }, latency);
        this.#pendingTimers.add(timer);
      } else {
        queueMicrotask(() => ws._receiveMessage(json));
      }
    }
    #log(direction, data, level = 'info') {
      if (!this.#logger) return;
      this.#logger.log(
        {
          timestamp: Date.now(),
          relay: this.url,
          direction,
          data
        },
        level
      );
    }
  };

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/types.js
  var WebSocketReadyState = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
  };

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/websocket.js
  var MockWebSocket = class _MockWebSocket extends EventTarget {
    static CONNECTING = WebSocketReadyState.CONNECTING;
    static OPEN = WebSocketReadyState.OPEN;
    static CLOSING = WebSocketReadyState.CLOSING;
    static CLOSED = WebSocketReadyState.CLOSED;
    CONNECTING = WebSocketReadyState.CONNECTING;
    OPEN = WebSocketReadyState.OPEN;
    CLOSING = WebSocketReadyState.CLOSING;
    CLOSED = WebSocketReadyState.CLOSED;
    url;
    protocol = '';
    extensions = '';
    binaryType = 'blob';
    bufferedAmount = 0;
    #readyState = WebSocketReadyState.CONNECTING;
    #relay;
    #connectionTimer;
    #openTimer;
    onopen = null;
    onclose = null;
    onmessage = null;
    onerror = null;
    /** @internal RelayResolverはMockPoolが設定する */
    static _resolveRelay = null;
    constructor(url, protocols) {
      super();
      this.url = typeof url === 'string' ? url : url.toString();
      if (protocols) {
        this.protocol = Array.isArray(protocols) ? (protocols[0] ?? '') : protocols;
      }
      this.#relay = _MockWebSocket._resolveRelay?.(this.url);
      if (!this.#relay) {
        queueMicrotask(() => {
          this.#fireError();
          this.#fireClose(1006, 'No mock relay registered for this URL');
        });
        return;
      }
      if (this.#relay._isRefused) {
        queueMicrotask(() => {
          this.#fireError();
          this.#fireClose(1006, 'Connection refused');
        });
        return;
      }
      this.#relay._registerConnection(this);
      const timeout = this.#relay.options.connectionTimeout;
      if (timeout !== void 0 && timeout > 0) {
        this.#connectionTimer = setTimeout(() => {
          if (this.#readyState === WebSocketReadyState.CONNECTING) {
            this.#clearTimers();
            this.#relay?._unregisterConnection(this);
            this.#fireError();
            this.#fireClose(1006, 'Connection timeout');
          }
        }, timeout);
      }
      this.#scheduleOpen();
    }
    #clearTimers() {
      if (this.#connectionTimer !== void 0) {
        clearTimeout(this.#connectionTimer);
        this.#connectionTimer = void 0;
      }
      if (this.#openTimer !== void 0) {
        clearTimeout(this.#openTimer);
        this.#openTimer = void 0;
      }
    }
    #scheduleOpen() {
      const delay = this.#relay?.options.connectionDelay ?? 0;
      const doOpen = () => {
        this.#openTimer = void 0;
        if (this.#readyState !== WebSocketReadyState.CONNECTING) return;
        this.#readyState = WebSocketReadyState.OPEN;
        this.#clearTimers();
        const openEvent = new Event('open');
        this.onopen?.(openEvent);
        this.dispatchEvent(openEvent);
        this.#relay?._handleOpen(this);
      };
      if (delay > 0) {
        this.#openTimer = setTimeout(doOpen, delay);
      } else {
        queueMicrotask(doOpen);
      }
    }
    get readyState() {
      return this.#readyState;
    }
    /**
     * メッセージを送信する
     *
     * 接続先のMockRelayにメッセージを転送する。
     */
    send(data) {
      if (this.#readyState !== WebSocketReadyState.OPEN) {
        throw new DOMException('WebSocket is not open', 'InvalidStateError');
      }
      if (typeof data !== 'string') {
        throw new Error('MockWebSocket only supports string messages');
      }
      this.#relay?._handleMessage(this, data);
    }
    /**
     * WebSocket接続を閉じる
     */
    close(code, reason) {
      if (
        this.#readyState === WebSocketReadyState.CLOSING ||
        this.#readyState === WebSocketReadyState.CLOSED
      ) {
        return;
      }
      this.#readyState = WebSocketReadyState.CLOSING;
      this.#clearTimers();
      queueMicrotask(() => {
        this.#relay?._unregisterConnection(this);
        this.#fireClose(code ?? 1e3, reason ?? '');
      });
    }
    /**
     * リレー側からメッセージを受信する
     * @internal MockRelayから呼び出される
     */
    _receiveMessage(data) {
      if (this.#readyState !== WebSocketReadyState.OPEN) return;
      const event = new MessageEvent('message', { data });
      this.onmessage?.(event);
      this.dispatchEvent(event);
    }
    /**
     * リレー側から接続を閉じる
     * @internal MockRelayから呼び出される
     */
    _forceClose(code, reason) {
      if (
        this.#readyState === WebSocketReadyState.CLOSING ||
        this.#readyState === WebSocketReadyState.CLOSED
      ) {
        return;
      }
      this.#clearTimers();
      this.#relay?._unregisterConnection(this);
      this.#fireClose(code, reason);
    }
    #fireError() {
      const event = new Event('error');
      this.onerror?.(event);
      this.dispatchEvent(event);
    }
    #fireClose(code, reason) {
      this.#readyState = WebSocketReadyState.CLOSED;
      const event = new CloseEvent('close', {
        code,
        reason,
        wasClean: code === 1e3
      });
      this.onclose?.(event);
      this.dispatchEvent(event);
    }
  };

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/pool.js
  function normalizeUrl(url) {
    return url.replace(/\/+$/, '');
  }
  function httpToWsUrl(httpUrl) {
    return httpUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  }
  function getHeaderValue(headers, name) {
    if (!headers) return null;
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (
          Array.isArray(entry) &&
          entry.length >= 2 &&
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'string' &&
          entry[0].toLowerCase() === name.toLowerCase()
        ) {
          return entry[1];
        }
      }
      return null;
    }
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return value;
      }
    }
    return null;
  }
  function isNip11Request(request, init) {
    if (init?.headers) {
      const accept = getHeaderValue(init.headers, 'accept') ?? '';
      return accept.toLowerCase().includes('application/nostr+json');
    }
    if (request instanceof Request) {
      const accept = request.headers.get('Accept') ?? '';
      return accept.toLowerCase().includes('application/nostr+json');
    }
    return false;
  }
  var MockPool = class _MockPool {
    static #currentInstance = null;
    #relays = /* @__PURE__ */ new Map();
    #originalWebSocket = null;
    #originalFetch = null;
    #installed = false;
    /**
     * MockRelayを登録・取得する
     *
     * 同一URLに対して複数回呼び出すと、既存のインスタンスを返す。
     *
     * @param url リレーURL (wss://...)
     * @param options リレーオプション
     * @returns MockRelayインスタンス
     */
    relay(url, options) {
      const key = normalizeUrl(url);
      const existing = this.#relays.get(key);
      if (existing) {
        return existing;
      }
      const mockRelay = new MockRelay(url, options);
      this.#relays.set(key, mockRelay);
      return mockRelay;
    }
    /**
     * globalThis.WebSocket をMockWebSocketに差し替える
     *
     * @throws {Error} 既にinstall済みの場合
     */
    install() {
      if (this.#installed) {
        throw new Error('MockPool is already installed');
      }
      if (_MockPool.#currentInstance && _MockPool.#currentInstance !== this) {
        throw new Error('Another MockPool instance is already installed');
      }
      this.#originalWebSocket = globalThis.WebSocket;
      MockWebSocket._resolveRelay = (url) => {
        return this.#relays.get(normalizeUrl(url));
      };
      dntGlobalThis.WebSocket = MockWebSocket;
      this.#originalFetch = globalThis.fetch;
      const relays = this.#relays;
      const originalFetch = this.#originalFetch;
      dntGlobalThis.fetch = (request, init) => {
        if (isNip11Request(request, init)) {
          const rawUrl =
            request instanceof Request
              ? request.url
              : request instanceof URL
                ? request.toString()
                : request;
          const wsUrl = normalizeUrl(httpToWsUrl(rawUrl));
          const relay = relays.get(wsUrl);
          if (relay) {
            const info = relay.getInfo();
            return Promise.resolve(
              new Response(JSON.stringify(info), {
                status: 200,
                headers: { 'Content-Type': 'application/nostr+json' }
              })
            );
          }
        }
        return originalFetch(request, init);
      };
      _MockPool.#currentInstance = this;
      this.#installed = true;
    }
    /**
     * 元のWebSocketを復元する
     *
     * @throws {Error} install されていない場合
     */
    uninstall() {
      if (!this.#installed) {
        throw new Error('MockPool is not installed');
      }
      if (this.#originalWebSocket) {
        dntGlobalThis.WebSocket = this.#originalWebSocket;
      }
      if (this.#originalFetch) {
        dntGlobalThis.fetch = this.#originalFetch;
      }
      MockWebSocket._resolveRelay = null;
      this.#originalWebSocket = null;
      this.#originalFetch = null;
      _MockPool.#currentInstance = null;
      this.#installed = false;
    }
    /**
     * 全リレーの状態をリセットする
     *
     * ストア、受信ログ、サブスクリプション、ハンドラーをクリアする。
     */
    reset() {
      for (const relay of this.#relays.values()) {
        relay.reset();
      }
    }
    /**
     * 現在のアクティブ接続一覧
     *
     * URL → 接続数のマップを返す。
     */
    get connections() {
      const result = /* @__PURE__ */ new Map();
      for (const [url, relay] of this.#relays) {
        const count = relay.connectionCount;
        if (count > 0) {
          result.set(url, count);
        }
      }
      return result;
    }
    /** install済みかどうか */
    get installed() {
      return this.#installed;
    }
    /**
     * `using` 構文（Explicit Resource Management）でのリソース解放
     *
     * install済みの場合、`uninstall()` を呼び出す。
     * 未インストール状態では何もしない。
     *
     * @example
     * ```ts
     * const pool = new MockPool();
     * pool.install();
     * using _ = pool;
     * // ブロック終了時に自動的に uninstall() が呼ばれる
     * ```
     */
    [Symbol.dispose]() {
      if (this.#installed) {
        this.uninstall();
      }
    }
    /**
     * `await using` 構文（Explicit Resource Management）でのリソース解放
     *
     * install済みの場合、`uninstall()` を呼び出す。
     * 未インストール状態では何もしない。
     *
     * @example
     * ```ts
     * const pool = new MockPool();
     * pool.install();
     * await using _ = pool;
     * // ブロック終了時に自動的に uninstall() が呼ばれる
     * ```
     */
    [Symbol.asyncDispose]() {
      if (this.#installed) {
        this.uninstall();
      }
      return Promise.resolve();
    }
  };
  return __toCommonJS(mod_exports);
})();
