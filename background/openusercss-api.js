'use strict';

(() => {
  const getOpname = /(query|mutation) ?([\w\d-_]+)? ?\(.*?\)? \{/;
  const gql = str => {
    str = Array.isArray(str) ? str.join('') : str;
    const name = getOpname.exec(str);

    return variables => {
      const data = {query: str};
      if (variables) data.variables = JSON.stringify(variables);
      if (name && name.length) {
        const operationName = name[2];
        if (operationName) data.operationName = name[2];
      }
      return JSON.stringify(data);
    };
  };

  const api = 'https://api.openusercss.org';
  const doQuery = ({id}, queryString) => {
    const query = gql(queryString);

    return fetch(api, {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json'
      }),
      body: query({
        id
      })
    })
    .then(res => res.json());
  };

  window.API_METHODS = Object.assign(window.API_METHODS || {}, {
    oucThemeById: params => doQuery(params, `
      query($id: ID!) {
        theme(id: $id) {
          _id
          title
          description
          createdAt
          lastUpdate
          version
          screenshots
          user {
            _id
            displayname
          }
        }
      }
    `),

    oucUserById: params => doQuery(params, `
      query($id: ID!) {
        user(id: $id) {
          _id
          displayname
          avatarUrl
          smallAvatarUrl
          bio
        }
      }
    `),
  });
})();
