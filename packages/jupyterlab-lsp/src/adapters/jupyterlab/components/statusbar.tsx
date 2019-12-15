// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
// Based on the @jupyterlab/codemirror-extension statusbar

import React from 'react';

import { VDomRenderer, VDomModel } from '@jupyterlab/apputils';
import '../../../../style/statusbar.css';

import * as SCHEMA from '../../../_schema';

import {
  interactiveItem,
  Popup,
  showPopup,
  TextItem,
  GroupItem
} from '@jupyterlab/statusbar';

import { DefaultIconReact } from '@jupyterlab/ui-components';
import { JupyterLabWidgetAdapter } from '../jl_adapter';
import { VirtualDocument } from '../../../virtual/document';
import { LSPConnection } from '../../../connection';
import { PageConfig } from '@jupyterlab/coreutils';

interface IServerStatusProps {
  server: SCHEMA.LanguageServerSession;
}

function ServerStatus(props: IServerStatusProps) {
  let list = props.server.spec.languages.map((language, i) => (
    <li key={i}>{language}</li>
  ));
  return (
    <div className={'lsp-server-status'}>
      <h5>{props.server.spec.display_name}</h5>
      <ul>{list}</ul>
    </div>
  );
}

export interface IListProps {
  /**
   * A title to display.
   */
  title: string;
  list: any[];
  /**
   * By default the list will be expanded; to change the initial state to collapsed, set to true.
   */
  startCollapsed?: boolean;
}

export interface ICollapsibleListStates {
  isCollapsed: boolean;
}

class CollapsibleList extends React.Component<
  IListProps,
  ICollapsibleListStates
> {
  constructor(props: any) {
    super(props);
    this.state = { isCollapsed: props.startCollapsed || false };

    // This binding is necessary to make `this` work in the callback
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick() {
    this.setState(state => ({
      isCollapsed: !state.isCollapsed
    }));
  }

  render() {
    return (
      <div
        className={
          'lsp-collapsible-list ' +
          (this.state.isCollapsed ? 'lsp-collapsed' : '')
        }
      >
        <h4 onClick={this.handleClick}>
          <span className={'lsp-caret'}></span>
          {this.props.title} ({this.props.list.length})
        </h4>
        <div>{this.props.list}</div>
      </div>
    );
  }
}

class LSPPopup extends VDomRenderer<LSPStatus.Model> {
  constructor(model: LSPStatus.Model) {
    super();
    this.model = model;
    this.addClass('lsp-popover');
  }
  render() {
    if (!this.model) {
      return null;
    }
    const servers_available = this.model.servers_available_not_in_use.map(
      (session, i) => <ServerStatus key={i} server={session} />
    );

    let running_servers = new Array<any>();
    let key = -1;
    for (let [
      session,
      documents_by_language
    ] of this.model.documents_by_server.entries()) {
      key += 1;
      let documents_html = new Array<any>();
      for (let [language, documents] of documents_by_language) {
        // TODO user readable document ids: filename, [cell id]
        // TODO: stop button
        // TODO: add a config buttons next to the language header
        let list = documents.map((document, i) => {
          let connection = this.model.adapter.connection_manager.connections.get(
            document.id_path
          );

          let status = '';
          if (connection.isInitialized) {
            status = 'initialized';
          } else if (connection.isConnected) {
            status = 'connected';
          } else {
            status = 'not connected';
          }

          return (
            <li key={i}>
              {document.id_path}
              <span className={'lsp-document-status'}>
                {status}
                <span
                  className={
                    'lsp-document-status-icon ' +
                    (status === 'initialized'
                      ? 'jp-FilledCircleIcon'
                      : 'jp-CircleIcon')
                  }
                ></span>
              </span>
            </li>
          );
        });

        documents_html.push(
          <div key={key} className={'lsp-documents-by-language'}>
            <h5>
              {language}{' '}
              <span className={'lsp-language-server-name'}>
                ({session.spec.display_name})
              </span>
            </h5>
            <ul>{list}</ul>
          </div>
        );
      }

      running_servers.push(<div key={key}>{documents_html}</div>);
    }

    const missing_languages = this.model.missing_languages.map(
      (language, i) => (
        <div key={i} className={'lsp-missing-server'}>
          {language}
        </div>
      )
    );
    return (
      <div className={'lsp-popover-content'}>
        <div className={'lsp-servers-menu'}>
          <h3 className={'lsp-servers-title'}>LSP servers</h3>
          <div className={'lsp-servers-lists'}>
            {servers_available.length ? (
              <CollapsibleList
                key={'available'}
                title={'Available'}
                list={servers_available}
                startCollapsed={true}
              />
            ) : (
              ''
            )}
            {running_servers.length ? (
              <CollapsibleList
                key={'running'}
                title={'Running'}
                list={running_servers}
              />
            ) : (
              ''
            )}
            {missing_languages.length ? (
              <CollapsibleList
                key={'missing'}
                title={'Missing'}
                list={missing_languages}
              />
            ) : (
              ''
            )}
          </div>
        </div>
        <div className={'lsp-popover-status'}>
          Documentation:{' '}
          <a
            href={
              'https://github.com/krassowski/jupyterlab-lsp/blob/master/LANGUAGESERVERS.md'
            }
            target={'_blank'}
          >
            Language Servers
          </a>
        </div>
      </div>
    );
  }
}

/**
 * StatusBar item.
 */
export class LSPStatus extends VDomRenderer<LSPStatus.Model> {
  protected _popup: Popup = null;
  /**
   * Construct a new VDomRenderer for the status item.
   */
  constructor() {
    super();
    this.model = new LSPStatus.Model();
    this.addClass(interactiveItem);
    this.addClass('lsp-statusbar-item');
    this.title.caption = 'LSP status';
  }

  /**
   * Render the status item.
   */
  render() {
    if (!this.model) {
      return null;
    }
    return (
      <GroupItem
        spacing={4}
        title={this.model.long_message}
        onClick={this.handleClick}
      >
        <DefaultIconReact
          name={this.model.status_icon}
          top={'2px'}
          kind={'statusBar'}
          title={'LSP Code Intelligence'}
        />
        <TextItem source={this.model.short_message} />
        <TextItem source={this.model.feature_message} />
      </GroupItem>
    );
  }

  handleClick = () => {
    if (this._popup) {
      this._popup.dispose();
    }
    this._popup = showPopup({
      body: new LSPPopup(this.model),
      anchor: this,
      align: 'left'
    });
  };
}

type StatusCode = 'waiting' | 'initializing' | 'initialized' | 'connecting';

export interface IStatus {
  connected_documents: Set<VirtualDocument>;
  initialized_documents: Set<VirtualDocument>;
  open_connections: Array<LSPConnection>;
  detected_documents: Set<VirtualDocument>;
  status: StatusCode;
}

function collect_documents(
  virtual_document: VirtualDocument
): Set<VirtualDocument> {
  let collected = new Set<VirtualDocument>();
  collected.add(virtual_document);
  for (let foreign of virtual_document.foreign_documents.values()) {
    let foreign_languages = collect_documents(foreign);
    foreign_languages.forEach(collected.add, collected);
  }
  return collected;
}

function collect_languages(virtual_document: VirtualDocument): Set<string> {
  let documents = collect_documents(virtual_document);
  return new Set(
    [...documents].map(document => document.language.toLocaleLowerCase())
  );
}

type StatusMap = Record<StatusCode, string>;

const iconByStatus: StatusMap = {
  waiting: 'refresh',
  initialized: 'running',
  initializing: 'refresh',
  connecting: 'refresh'
};

const shortMessageByStatus: StatusMap = {
  waiting: 'Waiting...',
  initialized: 'Fully initialized',
  initializing: 'Partially initialized',
  connecting: 'Connecting...'
};

export namespace LSPStatus {
  /**
   * A VDomModel for the LSP of current file editor/notebook.
   */
  export class Model extends VDomModel {
    server_extension_status: SCHEMA.ServersResponse = null;

    constructor() {
      super();

      // PathExt.join skips on of the slashes in https://
      let url = PageConfig.getBaseUrl() + 'lsp';
      fetch(url)
        .then(response => {
          // TODO: retry a few times
          if (!response.ok) {
            throw new Error(response.statusText);
          }
          response
            .json()
            .then(
              (data: SCHEMA.ServersResponse) =>
                (this.server_extension_status = data)
            )
            .catch(console.warn);
        })
        .catch(console.error);
    }

    get available_servers(): Array<SCHEMA.LanguageServerSession> {
      return this.server_extension_status.sessions;
    }

    get supported_languages(): Set<string> {
      const languages = new Set<string>();
      for (let server of this.available_servers) {
        for (let language of server.spec.languages) {
          languages.add(language.toLocaleLowerCase());
        }
      }
      return languages;
    }

    private is_server_running(server: SCHEMA.LanguageServerSession): boolean {
      for (let language of server.spec.languages) {
        if (this.detected_languages.has(language.toLocaleLowerCase())) {
          return true;
        }
      }
      return false;
    }

    get documents_by_server(): Map<
      SCHEMA.LanguageServerSession,
      Map<string, VirtualDocument[]>
    > {
      let data = new Map();
      if (!this.adapter) {
        return new Map();
      }

      let main_document = this.adapter.virtual_editor.virtual_document;
      let documents = collect_documents(main_document);

      for (let document of documents.values()) {
        let language = document.language.toLocaleLowerCase();
        let servers = this.available_servers.filter(
          server => server.spec.languages.indexOf(language) !== -1
        );
        if (servers.length > 1) {
          console.warn('More than one server per language for' + language);
        }
        if (servers.length === 0) {
          continue;
        }
        let server = servers[0];

        if (!data.has(server)) {
          data.set(server, new Map<string, VirtualDocument>());
        }

        let documents_map = data.get(server);

        if (!documents_map.has(language)) {
          documents_map.set(language, new Array<VirtualDocument>());
        }

        let documents = documents_map.get(language);
        documents.push(document);
      }
      return data;
    }

    get servers_available_not_in_use(): Array<SCHEMA.LanguageServerSession> {
      return this.available_servers.filter(
        server => !this.is_server_running(server)
      );
    }

    get detected_languages(): Set<string> {
      if (!this.adapter) {
        return new Set<string>();
      }

      let document = this.adapter.virtual_editor.virtual_document;
      return collect_languages(document);
    }

    get missing_languages(): Array<string> {
      // TODO: false negative for r vs R?
      return [...this.detected_languages].filter(
        language => !this.supported_languages.has(language.toLocaleLowerCase())
      );
    }

    get status(): IStatus {
      let connection_manager = this.adapter.connection_manager;
      const detected_documents = connection_manager.documents;
      let connected_documents = new Set<VirtualDocument>();
      let initialized_documents = new Set<VirtualDocument>();

      detected_documents.forEach((document, id_path) => {
        let connection = connection_manager.connections.get(id_path);
        if (!connection) {
          return;
        }

        if (connection.isConnected) {
          connected_documents.add(document);
        }
        if (connection.isInitialized) {
          initialized_documents.add(document);
        }
      });

      // there may be more open connections than documents if a document was recently closed
      // and the grace period has not passed yet
      let open_connections = new Array<LSPConnection>();
      connection_manager.connections.forEach((connection, path) => {
        if (connection.isConnected) {
          open_connections.push(connection);
        }
      });

      let status: StatusCode;
      if (detected_documents.size === 0) {
        status = 'waiting';
        // TODO: instead of detected documents, I should use "detected_documents_with_LSP_servers_available"
      } else if (initialized_documents.size === detected_documents.size) {
        status = 'initialized';
      } else if (connected_documents.size === detected_documents.size) {
        status = 'initializing';
      } else {
        status = 'connecting';
      }

      return {
        open_connections,
        connected_documents,
        initialized_documents,
        detected_documents: new Set([...detected_documents.values()]),
        status
      };
    }

    get status_icon(): string {
      if (!this.adapter) {
        return 'stop';
      }
      return iconByStatus[this.status.status];
    }

    get short_message(): string {
      if (!this.adapter) {
        return 'not initialized';
      }
      return shortMessageByStatus[this.status.status];
    }

    get feature_message(): string {
      return this.adapter ? this.adapter.status_message.message : '';
    }

    get long_message(): string {
      if (!this.adapter) {
        return 'not initialized';
      }
      let status = this.status;
      let msg = '';
      const plural = status.detected_documents.size > 1 ? 's' : '';
      if (status.status === 'waiting') {
        msg = 'Waiting for documents initialization...';
      } else if (status.status === 'initialized') {
        msg = `Fully connected & initialized (${status.detected_documents.size} virtual document${plural})`;
      } else if (status.status === 'initializing') {
        const uninitialized = new Set<VirtualDocument>(
          status.detected_documents
        );
        for (let initialized of status.initialized_documents.values()) {
          uninitialized.delete(initialized);
        }
        // servers for n documents did not respond ot the initialization request
        msg = `Fully connected, but ${uninitialized.size}/${
          status.detected_documents.size
        } virtual document${plural} stuck uninitialized: ${[...uninitialized]
          .map(document => document.id_path)
          .join(', ')}`;
      } else {
        const unconnected = new Set<VirtualDocument>(status.detected_documents);
        for (let connected of status.connected_documents.values()) {
          unconnected.delete(connected);
        }

        msg = `${status.connected_documents.size}/${
          status.detected_documents.size
        } virtual document${plural} connected (${
          status.open_connections.length
        } connections; waiting for: ${[...unconnected]
          .map(document => document.id_path)
          .join(', ')})`;
      }
      return msg;
    }

    get adapter(): JupyterLabWidgetAdapter | null {
      return this._adapter;
    }

    set adapter(adapter: JupyterLabWidgetAdapter | null) {
      const oldAdapter = this._adapter;
      if (oldAdapter !== null) {
        oldAdapter.connection_manager.connected.disconnect(this._onChange);
        oldAdapter.connection_manager.initialized.connect(this._onChange);
        oldAdapter.connection_manager.disconnected.disconnect(this._onChange);
        oldAdapter.connection_manager.closed.disconnect(this._onChange);
        oldAdapter.connection_manager.documents_changed.disconnect(
          this._onChange
        );
        oldAdapter.status_message.changed.connect(this._onChange);
      }

      let onChange = this._onChange.bind(this);
      adapter.connection_manager.connected.connect(onChange);
      adapter.connection_manager.initialized.connect(onChange);
      adapter.connection_manager.disconnected.connect(onChange);
      adapter.connection_manager.closed.connect(onChange);
      adapter.connection_manager.documents_changed.connect(onChange);
      adapter.status_message.changed.connect(onChange);
      this._adapter = adapter;
    }

    private _onChange() {
      this.stateChanged.emit(void 0);
    }

    private _adapter: JupyterLabWidgetAdapter | null = null;
  }
}
