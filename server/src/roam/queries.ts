export const RESOLVE_TAG_PAGES_Q = `
[:find ?title ?uid
 :in $ [?exact ...] ?pfx
 :where [?p :node/title ?title]
        [?p :block/uid ?uid]
        (or [(contains? #{?exact} ?title)]
            [(clojure.string/starts-with? ?title ?pfx)])]
`;

export const FETCH_TAGGED_BLOCKS_Q = `
[:find (pull ?b [:block/uid :block/string
                 {:block/refs [:node/title :block/uid]}
                 {:block/children [:block/string {:block/refs [:node/title :block/uid]}]}
                 {:block/page [:node/title]}
                 {:block/parents [:block/uid]}])
 :in $ [?tag-uid ...]
 :where [?tag :block/uid ?tag-uid]
        [?b :block/refs ?tag]]
`;
