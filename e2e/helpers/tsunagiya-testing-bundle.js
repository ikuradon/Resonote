var TsunagiyaTesting = (() => {
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

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/testing/mod.js
  var mod_exports = {};
  __export(mod_exports, {
    EventBuilder: () => EventBuilder,
    FilterBuilder: () => FilterBuilder,
    assertAuthCompleted: () => assertAuthCompleted,
    assertClosed: () => assertClosed,
    assertEventPublished: () => assertEventPublished,
    assertNoErrors: () => assertNoErrors,
    assertReceived: () => assertReceived,
    assertReceivedREQ: () => assertReceivedREQ,
    restore: () => restore,
    snapshot: () => snapshot,
    startStream: () => startStream,
    streamEvents: () => streamEvents,
    waitFor: () => waitFor
  });

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/testing/event_builder.js
  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  var EventBuilder = class _EventBuilder {
    #id;
    #pubkey;
    #kind;
    #content;
    #created_at;
    #tags;
    #sig;
    constructor(kind) {
      this.#id = randomHex(32);
      this.#pubkey = randomHex(32);
      this.#kind = kind;
      this.#content = '';
      this.#created_at = Math.floor(Date.now() / 1e3);
      this.#tags = [];
      this.#sig = randomHex(64);
    }
    // ===== スタティック ファクトリ =====
    /** kind:0 (Metadata) ビルダーを作成する */
    static kind0() {
      return new _EventBuilder(0);
    }
    /**
     * kind:1 (Short Text Note) ビルダーを作成する
     *
     * @example
     * ```ts
     * const event = EventBuilder.kind1().content("hello").build();
     * ```
     */
    static kind1() {
      return new _EventBuilder(1);
    }
    /** kind:3 (Contacts) ビルダーを作成する */
    static kind3() {
      return new _EventBuilder(3);
    }
    /** kind:4 (Encrypted DM) ビルダーを作成する */
    static kind4() {
      return new _EventBuilder(4);
    }
    /** kind:7 (Reaction) ビルダーを作成する */
    static kind7() {
      return new _EventBuilder(7);
    }
    /** 任意のkindでビルダーを作成する */
    static kind(k) {
      return new _EventBuilder(k);
    }
    // ===== ビルダーメソッド =====
    /**
     * コンテンツを設定する
     *
     * @param text イベントの content フィールドに設定する文字列
     * @example
     * ```ts
     * const event = EventBuilder.kind1().content("hello world").build();
     * assertEquals(event.content, "hello world");
     * ```
     */
    content(text) {
      this.#content = text;
      return this;
    }
    /**
     * タグを追加する
     *
     * 任意のタグを追加できる。同じキーのタグを複数追加可能。
     *
     * @param key タグ名 (e.g. "e", "p", "t")
     * @param values タグ値
     * @example
     * ```ts
     * const event = EventBuilder.kind1()
     *   .tag("e", "eventid123", "", "reply")
     *   .tag("p", "pubkey123")
     *   .build();
     * ```
     */
    tag(key, ...values) {
      this.#tags.push([key, ...values]);
      return this;
    }
    /** 公開鍵を設定する */
    pubkey(pubkey) {
      this.#pubkey = pubkey;
      return this;
    }
    /** IDを設定する */
    id(id) {
      this.#id = id;
      return this;
    }
    /** created_at を設定する */
    createdAt(timestamp) {
      this.#created_at = timestamp;
      return this;
    }
    /**
     * モック署名を生成する
     *
     * 実際の暗号署名ではなく、ランダムなhex文字列を署名として設定する。
     * 引数の秘密鍵は互換性のために受け付けるが、実際には使用しない（モック署名のためランダム文字列を生成）。
     */
    sign(_privateKey) {
      this.#sig = randomHex(64);
      return this;
    }
    /**
     * イベントを壊す
     *
     * 指定したフィールドを不正な値に置き換える。
     */
    corrupt(options) {
      if (options.id) this.#id = 'corrupted_' + randomHex(8);
      if (options.pubkey) this.#pubkey = 'corrupted_' + randomHex(8);
      if (options.sig) this.#sig = 'corrupted_' + randomHex(8);
      if (options.created_at) this.#created_at = -1;
      return this;
    }
    // ===== Common Tags =====
    /**
     * Geohash タグを追加する (NIP-52)
     */
    geohash(hash) {
      this.#tags.push(['g', hash]);
      return this;
    }
    /**
     * Emoji タグを追加する (NIP-30)
     */
    emoji(name, url) {
      this.#tags.push(['emoji', name, url]);
      return this;
    }
    /**
     * Expiration タグを追加する (NIP-40)
     *
     * @param unixTimestamp 有効期限 (UNIXタイムスタンプ秒)
     * @example
     * ```ts
     * const event = EventBuilder.kind1()
     *   .content("temporary message")
     *   .withExpiration(Math.floor(Date.now() / 1000) + 3600)
     *   .build();
     * ```
     */
    withExpiration(unixTimestamp) {
      this.#tags.push(['expiration', String(unixTimestamp)]);
      return this;
    }
    // ===== ビルド =====
    /** NostrEvent を構築して返す */
    build() {
      return {
        id: this.#id,
        pubkey: this.#pubkey,
        created_at: this.#created_at,
        kind: this.#kind,
        tags: [...this.#tags.map((t) => [...t])],
        content: this.#content,
        sig: this.#sig
      };
    }
    /**
     * EventSigner を使用してイベントを署名し、NostrEvent を構築して返す
     *
     * @param signer イベント署名インターフェース
     * @example
     * ```ts
     * const event = await EventBuilder.kind1()
     *   .content("hello")
     *   .buildWith(signer);
     * ```
     */
    async buildWith(signer) {
      const pubkey = await signer.getPublicKey();
      const unsigned = {
        pubkey,
        created_at: this.#created_at,
        kind: this.#kind,
        tags: [...this.#tags.map((t) => [...t])],
        content: this.#content
      };
      const { id, sig } = await signer.signEvent(unsigned);
      return { ...unsigned, id, sig };
    }
    // ===== スタティック ヘルパー =====
    /**
     * ランダムなイベントを生成する
     */
    static random(options = {}) {
      const builder = new _EventBuilder(options.kind ?? 1);
      if (options.pubkey) builder.pubkey(options.pubkey);
      builder.content('random: ' + randomHex(8));
      return builder.build();
    }
    /**
     * 複数のイベントを一括生成する
     *
     * @param count 生成するイベント数
     * @param options 生成オプション (kind, pubkey, seed)
     * @example
     * ```ts
     * // 10件のkind:1イベント
     * const events = EventBuilder.bulk(10);
     *
     * // シード指定で決定論的に生成
     * const events = EventBuilder.bulk(5, { seed: "test" });
     * ```
     */
    static bulk(count, options = {}) {
      const events = [];
      for (let i = 0; i < count; i++) {
        const builder = new _EventBuilder(options.kind ?? 1);
        if (options.pubkey) builder.pubkey(options.pubkey);
        if (options.seed !== void 0) {
          const seedStr = `${options.seed}-${i}`;
          const encoded = new TextEncoder().encode(seedStr);
          const hex = Array.from(encoded, (b) => b.toString(16).padStart(2, '0'))
            .join('')
            .padEnd(64, '0')
            .slice(0, 64);
          builder.id(hex);
          if (!options.pubkey) {
            const pubHex = Array.from(new TextEncoder().encode(`pub-${seedStr}`), (b) =>
              b.toString(16).padStart(2, '0')
            )
              .join('')
              .padEnd(64, '0')
              .slice(0, 64);
            builder.pubkey(pubHex);
          }
        }
        builder.content(`bulk event ${i}`);
        events.push(builder.build());
      }
      return events;
    }
    /**
     * 時系列のイベントを生成する
     *
     * created_at が interval 秒ずつ増加するイベント列を生成する。
     */
    static timeline(count, options = {}) {
      const interval = options.interval ?? 60;
      const startTime = options.startTime ?? Math.floor(Date.now() / 1e3);
      const events = [];
      for (let i = 0; i < count; i++) {
        const builder = new _EventBuilder(options.kind ?? 1);
        if (options.pubkey) builder.pubkey(options.pubkey);
        builder.createdAt(startTime + i * interval);
        builder.content(`timeline event ${i}`);
        events.push(builder.build());
      }
      return events;
    }
    /**
     * リプライチェーン（スレッド）を生成する
     *
     * @param depth チェーンの深さ
     * @returns [root, reply1, reply2, ...] のイベント配列
     * @example
     * ```ts
     * const [root, reply1, reply2] = EventBuilder.thread(3);
     * // reply1 は root への返信
     * // reply2 は reply1 への返信
     * ```
     */
    static thread(depth) {
      const events = [];
      const rootPubkey = randomHex(32);
      for (let i = 0; i < depth; i++) {
        const builder = new _EventBuilder(1);
        const pubkey = i === 0 ? rootPubkey : randomHex(32);
        builder.pubkey(pubkey);
        builder.createdAt(Math.floor(Date.now() / 1e3) + i);
        builder.content(`thread message ${i}`);
        if (i > 0) {
          builder.tag('e', events[0].id, '', 'root');
          if (i > 1) {
            builder.tag('e', events[i - 1].id, '', 'reply');
          }
          builder.tag('p', events[i - 1].pubkey);
        }
        events.push(builder.build());
      }
      return events;
    }
    /**
     * リアクション付き投稿を生成する
     *
     * @param reactionCount リアクション数
     * @param options オプション (content, targetKind)
     * @returns [post, reactions[]] のタプル
     */
    static withReactions(reactionCount, options) {
      const post = _EventBuilder.kind1().content('post with reactions').build();
      const reactions = [];
      for (let i = 0; i < reactionCount; i++) {
        const reaction = _EventBuilder
          .kind7()
          .content(options?.content ?? '+')
          .tag('e', post.id)
          .tag('p', post.pubkey);
        if (options?.targetKind !== void 0) {
          reaction.tag('k', String(options.targetKind));
        }
        reactions.push(reaction.build());
      }
      return [post, reactions];
    }
    /**
     * 既存イベントからビルダーを復元する
     *
     * 全フィールドをコピーし、チェーンで上書き可能にする。
     * タグはディープコピーされるため、元のイベントには影響しない。
     *
     * @param event コピー元のイベント
     * @example
     * ```ts
     * const original = EventBuilder.kind1().content("hello").build();
     * const modified = EventBuilder.from(original)
     *   .content("world")
     *   .build();
     * // original.content は "hello" のまま
     * ```
     */
    static from(event) {
      const builder = _EventBuilder.kind(event.kind);
      builder.#id = event.id;
      builder.#pubkey = event.pubkey;
      builder.#content = event.content;
      builder.#created_at = event.created_at;
      builder.#sig = event.sig;
      builder.#tags = event.tags.map((t) => [...t]);
      return builder;
    }
    /**
     * フィルターにマッチするイベントを自動生成する
     *
     * 指定されたフィルター条件を満たすイベントを生成する。
     * テストデータ作成時に便利。
     *
     * @param filter マッチさせるフィルター条件
     * @example
     * ```ts
     * const filter = { kinds: [1], authors: ["abc123"] };
     * const event = EventBuilder.matchFilter(filter);
     * // event.kind === 1, event.pubkey === "abc123"
     * ```
     */
    static matchFilter(filter) {
      const kind = filter.kinds?.[0] ?? 1;
      const builder = _EventBuilder.kind(kind);
      if (filter.authors?.[0]) {
        builder.pubkey(filter.authors[0]);
      }
      if (filter.since !== void 0) {
        builder.createdAt(filter.since);
      } else if (filter.until !== void 0) {
        builder.createdAt(filter.until);
      }
      if (filter.ids?.[0]) {
        const prefix = filter.ids[0];
        const remaining = randomHex(32);
        builder.id((prefix + remaining).slice(0, 64));
      }
      for (const key of Object.keys(filter)) {
        if (key.startsWith('#')) {
          const tagName = key.slice(1);
          const values = filter[key];
          if (values && values.length > 0) {
            builder.tag(tagName, values[0]);
          }
        }
      }
      if (filter.search) {
        builder.content(filter.search);
      }
      return builder.build();
    }
    // ===== NIP-09 削除リクエスト =====
    /**
     * 削除リクエスト (kind:5) ビルダーを作成する (NIP-09)
     *
     * @param eventIds 削除対象のイベントID配列
     * @param kinds 削除対象の kind 配列（k tag として付与）
     */
    static deletion(eventIds, kinds) {
      const builder = new _EventBuilder(5);
      for (const id of eventIds) {
        builder.tag('e', id);
      }
      if (kinds) {
        for (const k of kinds) {
          builder.tag('k', String(k));
        }
      }
      return builder;
    }
    /**
     * アドレス指定の削除リクエスト (kind:5) ビルダーを作成する (NIP-09)
     *
     * アドレスから kind を自動抽出し k tag として付与する。
     *
     * @param addresses 削除対象のアドレス配列 (kind:pubkey:d-tag 形式)
     */
    static deletionByAddress(addresses) {
      const builder = new _EventBuilder(5);
      const kinds = /* @__PURE__ */ new Set();
      for (const addr of addresses) {
        builder.tag('a', addr);
        const kind = addr.split(':')[0];
        if (kind) kinds.add(kind);
      }
      for (const k of kinds) {
        builder.tag('k', k);
      }
      return builder;
    }
    // ===== NIP別テンプレート =====
    /**
     * Metadata イベント (kind:0) を生成する
     */
    static metadata(profile) {
      return _EventBuilder.kind0().content(JSON.stringify(profile));
    }
    /**
     * Contacts イベント (kind:3) を生成する
     */
    static contacts(pubkeys) {
      const builder = _EventBuilder.kind3();
      for (const pk of pubkeys) {
        builder.tag('p', pk);
      }
      return builder;
    }
    /**
     * DM イベント (kind:4) を生成する
     *
     * content はモック暗号文（実際の暗号化は行わない）。
     */
    static dm(recipientPubkey, content) {
      return _EventBuilder
        .kind4()
        .content('mock-encrypted:' + content)
        .tag('p', recipientPubkey);
    }
    /**
     * グループメッセージ (NIP-29, kind:9) ビルダーを作成する
     */
    static groupMessage(groupId) {
      return _EventBuilder.kind(9).tag('h', groupId);
    }
    /**
     * Zap Request (kind:9734, NIP-57) を生成する
     */
    static zapRequest(options) {
      const builder = _EventBuilder
        .kind(9734)
        .content('')
        .tag('amount', String(options.amount))
        .tag('lnurl', options.lnurl)
        .tag('relays', ...options.relays);
      if (options.eventId) {
        builder.tag('e', options.eventId);
      }
      if (options.recipientPubkey) {
        builder.tag('p', options.recipientPubkey);
      }
      return builder;
    }
    /**
     * NIP-07 Request (kind:24133) を生成する
     */
    static nip07Request() {
      return _EventBuilder.kind(24133).content('mock-nip07-request');
    }
    // ===== NIP-52 Calendar Events =====
    /**
     * Date-based Calendar Event (kind:31922, NIP-52) ビルダーを作成する
     */
    static calendarDateEvent(options) {
      const builder = new _EventBuilder(31922)
        .tag('d', options.title.toLowerCase().replace(/\s+/g, '-'))
        .tag('title', options.title)
        .tag('start', options.startDate);
      if (options.endDate) builder.tag('end', options.endDate);
      if (options.location) builder.tag('location', options.location);
      if (options.geohash) builder.tag('g', options.geohash);
      if (options.participants) {
        for (const p of options.participants) {
          builder.tag('p', p);
        }
      }
      if (options.hashtags) {
        for (const t of options.hashtags) {
          builder.tag('t', t);
        }
      }
      return builder;
    }
    /**
     * Time-based Calendar Event (kind:31923, NIP-52) ビルダーを作成する
     */
    static calendarTimeEvent(options) {
      const builder = new _EventBuilder(31923)
        .tag('d', options.title.toLowerCase().replace(/\s+/g, '-'))
        .tag('title', options.title)
        .tag('start', String(options.start));
      if (options.end) {
        builder.tag('end', String(options.end));
      }
      if (options.startTzid) builder.tag('start_tzid', options.startTzid);
      if (options.endTzid) builder.tag('end_tzid', options.endTzid);
      if (options.location) builder.tag('location', options.location);
      if (options.geohash) builder.tag('g', options.geohash);
      if (options.participants) {
        for (const p of options.participants) {
          builder.tag('p', p);
        }
      }
      if (options.hashtags) {
        for (const t of options.hashtags) {
          builder.tag('t', t);
        }
      }
      return builder;
    }
    /**
     * Calendar Collection (kind:31924, NIP-52) ビルダーを作成する
     */
    static calendarCollection(options) {
      const builder = new _EventBuilder(31924)
        .tag('d', options.title.toLowerCase().replace(/\s+/g, '-'))
        .tag('title', options.title);
      for (const eventRef of options.events) {
        builder.tag('a', eventRef);
      }
      return builder;
    }
    /**
     * Calendar Event RSVP (kind:31925, NIP-52) ビルダーを作成する
     */
    static calendarRsvp(options) {
      const builder = new _EventBuilder(31925)
        .tag('a', options.eventAddress)
        .tag('d', options.eventAddress)
        .tag('status', options.status);
      if (options.freebusy) builder.tag('freebusy', options.freebusy);
      if (options.content) builder.content(options.content);
      return builder;
    }
    // ===== NIP-65 Relay List Metadata =====
    /**
     * Relay List Metadata (kind:10002, NIP-65) ビルダーを作成する
     *
     * @param relays リレーURL一覧（marker省略時は読み書き両用）
     */
    static relayList(relays) {
      const builder = new _EventBuilder(10002);
      for (const relay of relays) {
        if (relay.marker) {
          builder.tag('r', relay.url, relay.marker);
        } else {
          builder.tag('r', relay.url);
        }
      }
      return builder;
    }
    // ===== NIP-18 Reposts =====
    /**
     * Repost (kind:6, NIP-18) ビルダーを作成する
     *
     * @param targetEvent リポスト対象イベント
     * @param relayUrl 対象イベントが存在するリレーURL
     */
    static repost(targetEvent, relayUrl) {
      const builder = new _EventBuilder(6)
        .content(JSON.stringify(targetEvent))
        .tag('e', targetEvent.id, relayUrl ?? '')
        .tag('p', targetEvent.pubkey);
      return builder;
    }
    /**
     * Generic Repost (kind:16, NIP-18) ビルダーを作成する
     *
     * kind:1 以外のイベントをリポストする場合に使用する。
     *
     * @param targetEvent リポスト対象イベント
     * @param relayUrl 対象イベントが存在するリレーURL
     */
    static genericRepost(targetEvent, relayUrl) {
      const builder = new _EventBuilder(16)
        .content(JSON.stringify(targetEvent))
        .tag('e', targetEvent.id, relayUrl ?? '')
        .tag('p', targetEvent.pubkey)
        .tag('k', String(targetEvent.kind));
      return builder;
    }
    // ===== NIP-23 Long-form Content =====
    /**
     * Long-form Content (kind:30023, NIP-23) ビルダーを作成する
     *
     * @param options Long-form Content オプション
     */
    static longFormContent(options) {
      const builder = new _EventBuilder(30023)
        .content(options.content)
        .tag('d', options.identifier)
        .tag('title', options.title);
      if (options.summary) builder.tag('summary', options.summary);
      if (options.image) builder.tag('image', options.image);
      if (options.publishedAt !== void 0) {
        builder.tag('published_at', String(options.publishedAt));
      }
      if (options.hashtags) {
        for (const t of options.hashtags) {
          builder.tag('t', t);
        }
      }
      return builder;
    }
    /**
     * Long-form Content Draft (kind:30024, NIP-23) ビルダーを作成する
     *
     * @param options Long-form Content オプション
     */
    static longFormDraft(options) {
      const builder = new _EventBuilder(30024)
        .content(options.content)
        .tag('d', options.identifier)
        .tag('title', options.title);
      if (options.summary) builder.tag('summary', options.summary);
      if (options.image) builder.tag('image', options.image);
      if (options.publishedAt !== void 0) {
        builder.tag('published_at', String(options.publishedAt));
      }
      if (options.hashtags) {
        for (const t of options.hashtags) {
          builder.tag('t', t);
        }
      }
      return builder;
    }
    // ===== NIP-25 External Reactions =====
    /**
     * 外部コンテンツへのリアクション (kind:17, NIP-25) ビルダーを作成する
     *
     * @param url 対象コンテンツのURL
     * @param contentType コンテンツタイプ (e.g. "text/html")
     */
    static externalReaction(url, contentType) {
      return new _EventBuilder(17).content('+').tag('i', url).tag('k', contentType);
    }
    // ===== NIP-51 Lists =====
    /**
     * Mute List (kind:10000, NIP-51) ビルダーを作成する
     *
     * @param options ミュートリストオプション
     */
    static muteList(options) {
      const builder = new _EventBuilder(1e4);
      if (options.pubkeys) {
        for (const pk of options.pubkeys) builder.tag('p', pk);
      }
      if (options.eventIds) {
        for (const id of options.eventIds) builder.tag('e', id);
      }
      if (options.addresses) {
        for (const addr of options.addresses) builder.tag('a', addr);
      }
      if (options.hashtags) {
        for (const t of options.hashtags) builder.tag('t', t);
      }
      if (options.words) {
        for (const w of options.words) builder.tag('word', w);
      }
      return builder;
    }
    /**
     * Pin List (kind:10001, NIP-51) ビルダーを作成する
     *
     * @param eventIds ピン留めするイベントID一覧
     */
    static pinList(eventIds) {
      const builder = new _EventBuilder(10001);
      for (const id of eventIds) builder.tag('e', id);
      return builder;
    }
    /**
     * Bookmarks (kind:10003, NIP-51) ビルダーを作成する
     *
     * @param options ブックマークオプション
     */
    static bookmarks(options) {
      const builder = new _EventBuilder(10003);
      if (options.pubkeys) {
        for (const pk of options.pubkeys) builder.tag('p', pk);
      }
      if (options.eventIds) {
        for (const id of options.eventIds) builder.tag('e', id);
      }
      if (options.addresses) {
        for (const addr of options.addresses) builder.tag('a', addr);
      }
      if (options.hashtags) {
        for (const t of options.hashtags) builder.tag('t', t);
      }
      if (options.words) {
        for (const w of options.words) builder.tag('word', w);
      }
      return builder;
    }
    /**
     * Follow Set (kind:30000, NIP-51) ビルダーを作成する
     *
     * @param dTag リストの識別子
     * @param pubkeys フォローする公開鍵一覧
     */
    static followSet(dTag, pubkeys) {
      const builder = new _EventBuilder(3e4).tag('d', dTag);
      for (const pk of pubkeys) builder.tag('p', pk);
      return builder;
    }
    /**
     * Relay Set (kind:30002, NIP-51) ビルダーを作成する
     *
     * @param dTag リストの識別子
     * @param relayUrls リレーURL一覧
     */
    static relaySet(dTag, relayUrls) {
      const builder = new _EventBuilder(30002).tag('d', dTag);
      for (const url of relayUrls) builder.tag('relay', url);
      return builder;
    }
    /**
     * Emoji Set (kind:30030, NIP-51) ビルダーを作成する
     *
     * @param dTag リストの識別子
     * @param emojis 絵文字一覧 ([name, url] のタプル)
     */
    static emojiSet(dTag, emojis) {
      const builder = new _EventBuilder(30030).tag('d', dTag);
      for (const [name, url] of emojis) builder.tag('emoji', name, url);
      return builder;
    }
    // ===== NIP-17 Private Direct Messages =====
    /**
     * Chat Message (kind:14, NIP-17) ビルダーを作成する
     *
     * @param options チャットメッセージオプション
     */
    static chatMessage(options) {
      const builder = new _EventBuilder(14)
        .content(options.content)
        .tag('p', options.recipientPubkey);
      if (options.replyTo) builder.tag('e', options.replyTo, '', 'reply');
      if (options.subject) builder.tag('subject', options.subject);
      return builder;
    }
    /**
     * Seal (kind:13, NIP-17) ビルダーを作成する
     *
     * 内部イベントをモック暗号文でラップする。
     *
     * @param innerEvent ラップするイベント
     */
    static seal(innerEvent) {
      return new _EventBuilder(13).content('mock-sealed:' + JSON.stringify(innerEvent));
    }
    /**
     * Gift Wrap (kind:1059, NIP-17) ビルダーを作成する
     *
     * ランダムな pubkey と created_at を使用する。
     *
     * @param options ギフトラップオプション
     */
    static giftWrap(options) {
      const randomCreatedAt = Math.floor(Date.now() / 1e3) - Math.floor(Math.random() * 172800);
      return new _EventBuilder(1059)
        .pubkey(randomHex(32))
        .createdAt(randomCreatedAt)
        .content('mock-giftwrapped:' + JSON.stringify(options.innerEvent))
        .tag('p', options.recipientPubkey);
    }
    /**
     * DM Relay List (kind:10050, NIP-17) ビルダーを作成する
     *
     * @param relayUrls DM受信用リレーURL一覧
     */
    static dmRelayList(relayUrls) {
      const builder = new _EventBuilder(10050);
      for (const url of relayUrls) builder.tag('relay', url);
      return builder;
    }
    /**
     * Private DM (NIP-17) を一括で生成するコンビニエンスメソッド
     *
     * chatMessage → seal → giftWrap の3段階をまとめて実行する。
     *
     * @param options チャットメッセージオプション
     */
    static privateDM(options) {
      const chatEvent = _EventBuilder.chatMessage(options).build();
      const sealedEvent = _EventBuilder.seal(chatEvent).build();
      return _EventBuilder
        .giftWrap({
          recipientPubkey: options.recipientPubkey,
          innerEvent: sealedEvent
        })
        .build();
    }
  };

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/testing/filter_builder.js
  var FilterBuilder = class {
    /**
     * タイムラインフィルター (kind:1)
     *
     * @param options フィルターオプション
     * @example
     * ```ts
     * const filter = FilterBuilder.timeline({ limit: 20, since: 1700000000 });
     * // → { kinds: [1], limit: 20, since: 1700000000 }
     * ```
     */
    static timeline(options = {}) {
      const filter = { kinds: [1] };
      if (options.limit !== void 0) filter.limit = options.limit;
      if (options.since !== void 0) filter.since = options.since;
      if (options.until !== void 0) filter.until = options.until;
      return filter;
    }
    /**
     * プロフィールフィルター (kind:0)
     */
    static profile(pubkey) {
      return { kinds: [0], authors: [pubkey] };
    }
    /**
     * メンションフィルター (kind:1, #p タグ)
     */
    static mentions(pubkey) {
      return { kinds: [1], '#p': [pubkey] };
    }
    /**
     * リアクションフィルター (kind:7, #e タグ)
     */
    static reactions(eventId) {
      return { kinds: [7], '#e': [eventId] };
    }
    /**
     * 検索フィルター (NIP-50)
     *
     * @param keyword 検索キーワード
     */
    static search(keyword) {
      return { search: keyword };
    }
    // ===== NIP-52 Calendar Events =====
    /**
     * Date-based Calendar Event フィルター (kind:31922, NIP-52)
     */
    static calendarDateEvents() {
      return { kinds: [31922] };
    }
    /**
     * Time-based Calendar Event フィルター (kind:31923, NIP-52)
     */
    static calendarTimeEvents() {
      return { kinds: [31923] };
    }
    /**
     * 全 Calendar Event フィルター (kind:31922 + 31923, NIP-52)
     */
    static calendarEvents() {
      return { kinds: [31922, 31923] };
    }
    /**
     * Calendar Collection フィルター (kind:31924, NIP-52)
     */
    static calendarCollections() {
      return { kinds: [31924] };
    }
    /**
     * Calendar Event RSVP フィルター (kind:31925, NIP-52)
     */
    static rsvps(eventAddress) {
      return { kinds: [31925], '#a': [eventAddress] };
    }
    // ===== NIP-65 Relay List Metadata =====
    /**
     * Relay List Metadata フィルター (kind:10002, NIP-65)
     *
     * @param pubkey 対象の公開鍵
     */
    static relayList(pubkey) {
      return { kinds: [10002], authors: [pubkey] };
    }
    // ===== NIP-18 Reposts =====
    /**
     * Repost フィルター (kind:6, NIP-18)
     *
     * @param eventId リポスト対象のイベントID
     */
    static reposts(eventId) {
      return { kinds: [6], '#e': [eventId] };
    }
    /**
     * 全リポストフィルター (kind:6 + 16, NIP-18)
     *
     * @param eventId リポスト対象のイベントID
     */
    static allReposts(eventId) {
      return { kinds: [6, 16], '#e': [eventId] };
    }
    // ===== NIP-23 Long-form Content =====
    /**
     * Long-form Content フィルター (kind:30023, NIP-23)
     *
     * @param pubkey 特定の著者で絞り込む場合に指定
     */
    static longFormContent(pubkey) {
      const filter = { kinds: [30023] };
      if (pubkey) filter.authors = [pubkey];
      return filter;
    }
    /**
     * ハッシュタグによる Long-form Content フィルター (kind:30023, NIP-23)
     *
     * @param hashtag ハッシュタグ（#なし）
     */
    static longFormByTag(hashtag) {
      return { kinds: [30023], '#t': [hashtag] };
    }
    // ===== NIP-25 Reactions =====
    /**
     * アドレス指定リアクションフィルター (kind:7, NIP-25)
     *
     * @param address アドレス (kind:pubkey:d-tag 形式)
     */
    static reactionsTo(address) {
      return { kinds: [7], '#a': [address] };
    }
    // ===== NIP-51 Lists =====
    /**
     * Mute List フィルター (kind:10000, NIP-51)
     *
     * @param pubkey 対象の公開鍵
     */
    static muteList(pubkey) {
      return { kinds: [1e4], authors: [pubkey] };
    }
    /**
     * Pin List フィルター (kind:10001, NIP-51)
     *
     * @param pubkey 対象の公開鍵
     */
    static pinList(pubkey) {
      return { kinds: [10001], authors: [pubkey] };
    }
    /**
     * Bookmarks フィルター (kind:10003, NIP-51)
     *
     * @param pubkey 対象の公開鍵
     */
    static bookmarks(pubkey) {
      return { kinds: [10003], authors: [pubkey] };
    }
    /**
     * Follow Sets フィルター (kind:30000, NIP-51)
     *
     * @param pubkey 対象の公開鍵
     */
    static followSets(pubkey) {
      return { kinds: [3e4], authors: [pubkey] };
    }
    // ===== NIP-17 Private Direct Messages =====
    /**
     * Gift Wraps フィルター (kind:1059, NIP-17)
     *
     * @param pubkey 受信者の公開鍵
     */
    static giftWraps(pubkey) {
      return { kinds: [1059], '#p': [pubkey] };
    }
    /**
     * DM Relay List フィルター (kind:10050, NIP-17)
     *
     * @param pubkey 対象の公開鍵
     */
    static dmRelayList(pubkey) {
      return { kinds: [10050], authors: [pubkey] };
    }
    /**
     * 著者フィルター
     *
     * @param pubkey 公開鍵
     * @example
     * ```ts
     * const filter = FilterBuilder.author("abc123");
     * // → { authors: ["abc123"] }
     * ```
     */
    static author(pubkey) {
      return { authors: [pubkey] };
    }
    /**
     * kind フィルター
     *
     * @param k イベントkind
     */
    static kind(k) {
      return { kinds: [k] };
    }
    /**
     * 時刻下限フィルター
     *
     * @param timestamp since (UNIX秒)
     */
    static since(timestamp) {
      return { since: timestamp };
    }
    /**
     * タグフィルター
     *
     * @param tagName タグ名（#なし、例: "e", "p"）
     * @param values マッチする値の配列
     */
    static tagged(tagName, values) {
      return { [`#${tagName}`]: values };
    }
    /**
     * 複数フィルターをマージした単一フィルターを生成する
     *
     * kinds/authors は結合してユニーク化、since は最大値、
     * until は最小値、limit は最小値を採用する。
     *
     * @param filters マージするフィルター群
     * @example
     * ```ts
     * const combined = FilterBuilder.combine(
     *   { kinds: [1], since: 100 },
     *   { kinds: [7], since: 200 },
     * );
     * // → { kinds: [1, 7], since: 200 }
     * ```
     */
    static combine(...filters) {
      const result = {};
      const kindsSet = /* @__PURE__ */ new Set();
      const authorsSet = /* @__PURE__ */ new Set();
      const tagMap = /* @__PURE__ */ new Map();
      let since;
      let until;
      let limit;
      for (const f of filters) {
        if (f.kinds) {
          for (const k of f.kinds) kindsSet.add(k);
        }
        if (f.authors) {
          for (const a of f.authors) authorsSet.add(a);
        }
        if (f.since !== void 0) {
          since = since === void 0 ? f.since : Math.max(since, f.since);
        }
        if (f.until !== void 0) {
          until = until === void 0 ? f.until : Math.min(until, f.until);
        }
        if (f.limit !== void 0) {
          limit = limit === void 0 ? f.limit : Math.min(limit, f.limit);
        }
        for (const key of Object.keys(f)) {
          if (key.startsWith('#')) {
            const vals = f[key];
            if (vals) {
              const set = tagMap.get(key) ?? /* @__PURE__ */ new Set();
              for (const v of vals) set.add(v);
              tagMap.set(key, set);
            }
          }
        }
      }
      if (kindsSet.size > 0) result.kinds = Array.from(kindsSet);
      if (authorsSet.size > 0) result.authors = Array.from(authorsSet);
      if (since !== void 0) result.since = since;
      if (until !== void 0) result.until = until;
      if (limit !== void 0) result.limit = limit;
      for (const [key, vals] of tagMap) {
        result[key] = Array.from(vals);
      }
      return result;
    }
  };

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/testing/assertions.js
  function assertReceivedREQ(relay, filters) {
    const reqs = relay.received.filter((m) => m[0] === 'REQ');
    const found = reqs.some((req) => {
      const reqFilters = req.slice(2);
      return reqFilters.some((f) => filtersMatch(f, filters));
    });
    if (!found) {
      throw new Error(
        `Expected REQ with filters ${JSON.stringify(filters)} but none found. Received ${reqs.length} REQ(s).`
      );
    }
  }
  function assertEventPublished(relay, eventId) {
    if (!relay.hasEvent(eventId)) {
      throw new Error(
        `Expected EVENT with id "${eventId}" to be published but not found. Received ${relay.countEvents()} EVENT(s).`
      );
    }
  }
  function assertNoErrors(relay) {
    const errors = relay.errors;
    if (errors.length > 0) {
      throw new Error(`Expected no errors but found ${errors.length}: ${errors.join(', ')}`);
    }
  }
  function assertAuthCompleted(relay) {
    const authMessages = relay.received.filter((m) => m[0] === 'AUTH');
    if (authMessages.length === 0) {
      throw new Error('Expected AUTH response but none found.');
    }
    const results = relay.authResults;
    const hasSuccess = results.some((r) => r.accepted);
    if (!hasSuccess) {
      throw new Error(
        `AUTH was sent but no successful authentication found. Results: ${JSON.stringify(results)}`
      );
    }
  }
  function assertClosed(relay, subId) {
    if (!relay.findCLOSE(subId)) {
      throw new Error(`Expected CLOSE for subscription "${subId}" but not found.`);
    }
  }
  function assertReceived(relay, predicate) {
    const messages = relay.received;
    if (!predicate(messages)) {
      throw new Error(`Custom assertion failed. Received ${messages.length} message(s).`);
    }
  }
  function filtersMatch(actual, expected) {
    if (expected.kinds !== void 0) {
      if (actual.kinds === void 0 || !expected.kinds.every((k) => actual.kinds.includes(k))) {
        return false;
      }
    }
    if (expected.authors !== void 0) {
      if (actual.authors === void 0 || !expected.authors.every((a) => actual.authors.includes(a))) {
        return false;
      }
    }
    if (expected.ids !== void 0) {
      if (actual.ids === void 0 || !expected.ids.every((id) => actual.ids.includes(id))) {
        return false;
      }
    }
    if (expected.since !== void 0 && actual.since !== expected.since) {
      return false;
    }
    if (expected.until !== void 0 && actual.until !== expected.until) {
      return false;
    }
    if (expected.limit !== void 0 && actual.limit !== expected.limit) {
      return false;
    }
    if (expected.search !== void 0 && actual.search !== expected.search) {
      return false;
    }
    for (const key of Object.keys(expected)) {
      if (key.startsWith('#')) {
        const expectedValues = expected[key];
        const actualValues = actual[key];
        if (expectedValues !== void 0) {
          if (actualValues === void 0 || !expectedValues.every((v) => actualValues.includes(v))) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/event_kind.js
  function classifyEvent(kind) {
    if (kind === 0 || kind === 3) return 'replaceable';
    if (kind >= 1e4 && kind < 2e4) return 'replaceable';
    if (kind >= 2e4 && kind < 3e4) return 'ephemeral';
    if (kind >= 3e4 && kind < 4e4) return 'parameterized_replaceable';
    return 'regular';
  }

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/testing/stream.js
  function streamEvents(relay, events, options = {}) {
    const interval = options.interval ?? 100;
    const jitter = options.jitter ?? 0;
    let index = 0;
    let stopped = false;
    let timer = null;
    function scheduleNext() {
      if (stopped || index >= events.length) return;
      const delay = interval + (jitter > 0 ? Math.round((Math.random() * 2 - 1) * jitter) : 0);
      const effectiveDelay = Math.max(0, delay);
      timer = setTimeout(() => {
        if (stopped || index >= events.length) return;
        const event = events[index++];
        const stored = relay.store(event);
        if (stored || classifyEvent(event.kind) === 'ephemeral') {
          relay.broadcast(event);
        }
        scheduleNext();
      }, effectiveDelay);
    }
    scheduleNext();
    return {
      stop() {
        stopped = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      },
      get stopped() {
        return stopped;
      }
    };
  }
  function startStream(relay, options) {
    const interval = options.interval ?? 1e3;
    const jitter = options.jitter ?? 0;
    const maxCount = options.count;
    let count = 0;
    let stopped = false;
    let timer = null;
    function scheduleNext() {
      if (stopped) return;
      if (maxCount !== void 0 && count >= maxCount) {
        stopped = true;
        return;
      }
      const delay = interval + (jitter > 0 ? Math.round((Math.random() * 2 - 1) * jitter) : 0);
      const effectiveDelay = Math.max(0, delay);
      timer = setTimeout(() => {
        if (stopped) return;
        if (maxCount !== void 0 && count >= maxCount) {
          stopped = true;
          return;
        }
        const event = options.eventGenerator();
        const stored = relay.store(event);
        if (stored || classifyEvent(event.kind) === 'ephemeral') {
          relay.broadcast(event);
        }
        count++;
        scheduleNext();
      }, effectiveDelay);
    }
    scheduleNext();
    return {
      stop() {
        stopped = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      },
      get stopped() {
        return stopped;
      }
    };
  }

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/testing/snapshot.js
  function snapshot(relay) {
    return relay.snapshot();
  }
  function restore(relay, snap) {
    relay.restore(snap);
  }

  // node_modules/.pnpm/@ikuradon+tsunagiya@0.4.0/node_modules/@ikuradon/tsunagiya/esm/testing/wait.js
  function waitFor(condition, options = {}) {
    const timeout = options.timeout ?? 5e3;
    const interval = options.interval ?? 10;
    if (condition()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        clearInterval(poller);
        reject(new Error(`waitFor timed out after ${timeout}ms`));
      }, timeout);
      const poller = setInterval(() => {
        if (condition()) {
          clearInterval(poller);
          clearTimeout(deadline);
          resolve();
        }
      }, interval);
    });
  }
  return __toCommonJS(mod_exports);
})();
