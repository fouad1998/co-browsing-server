enum EVENTS_TYPE {
    CLICK = 0,
    INPUT,
    MOUSE,
    DOM_CHANGE,
    ATTRIBUTE_CHANGE,
    SNAPSHOT,
}
interface CoBrowsingInterface {
    root: HTMLElement;
    coBrowsingExec: boolean // If the co-browser is used to execute remote event
    socket: WebSocket// the websocket connection, it can be other thing if we want like (RTC, XHR...)
}

interface HTMLElementSerialization {
    id: number;
    type: number;
    tag?: string;
    content?: string;
    attributes?: {};
    children?: Array<HTMLElementSerialization>;
}

interface mouseClick {
    x: number;
    y: number;
}

interface inputEvent {
    id: number;
    content: string;
}

interface DOMEvent {
    id: number;
    content: HTMLElementSerialization
}

interface AttributeEvent {
    id: number;
    content: {}
}
interface SnapShotEvent {
    href: string
    content: string
}
interface HTMLEvent {
    type: number;
    data: mouseClick | inputEvent | DOMEvent | AttributeEvent | SnapShotEvent
}


const map = new Map<number, HTMLElement>()

export class CoBrowsing {
    _id = -1;
    map: Map<number, HTMLElement>
    iframe: HTMLIFrameElement | null = null
    wrapper: HTMLDivElement | null = null
    root: HTMLElement
    config: Partial<CoBrowsingInterface> = {}
    socket: WebSocket
    constructor(props: CoBrowsingInterface){
        if (!props.socket) {
            throw Error("Not enough of params received. Websocket connection is missing")
        }
        this.map = new Map<number, HTMLElement>()
        this.root = props.root
        this.config = props
        this.socket = props.socket
        this.socket.onmessage = this.executeEvent
        // bind
        this.snapshot = this.snapshot.bind(this)
        this.buildElementNode = this.buildElementNode.bind(this)
        this.executeEvent = this.executeEvent.bind(this)
        this.rebuildDOM = this.rebuildDOM.bind(this)
        this.serializeDOMElement = this.serializeDOMElement.bind(this)
        this.setup = this.setup.bind(this)
    }

    setConfig(config: CoBrowsingInterface){
        this.config = config
    }

    snapshot(): HTMLElementSerialization | undefined {
        // The object here is used as the controller, not the receiver, so we don't need to get snapshot of it
        if (!this.config.coBrowsingExec) return undefined
        
        const DOMVirual = this.serializeDOMElement(document)
        return DOMVirual
    }

    private buildDOM(DOMString: string):void {
        const DOM = JSON.parse(DOMString) as HTMLElementSerialization
        this.rebuildDOM(DOM, this.iframe?.contentDocument as Document)
    }

    private executeEvent(event: MessageEvent): void {
        // the object in this case is not used to execute commande not, because we are in the remote pair 
        if (!this.config.coBrowsingExec) return undefined

        // Try to execute an event using received event structure
        try {
            const eventString  =  event.data
            const parsedEvent = JSON.parse(eventString) as HTMLEvent
            // type is the type of event we received to execute, if the type doesn't exist so it should not be executed
            switch (parsedEvent.type){
                case EVENTS_TYPE.INPUT: {
                    const eventContent = parsedEvent.data  as inputEvent
                    const node = map.get(eventContent.id) as HTMLInputElement
                    node.value = eventContent.content
                    break
                }
    
                case EVENTS_TYPE.ATTRIBUTE_CHANGE:{
                    const eventContent = parsedEvent.data as AttributeEvent
                    const node = map.get(eventContent.id)
                    //@ts-ignore
                    Object.keys(eventContent.content).forEach(key => node?.setAttribute(key, eventContent.content[key]))
                    break
                }
    
                case EVENTS_TYPE.DOM_CHANGE: {
                    const eventContent = parsedEvent.data as DOMEvent
                    const node = map.get(eventContent.id)
    
                    const removeIDs = (child: HTMLElement) => {
                        if (child.nodeType !== document.ELEMENT_NODE) return undefined
                        //@ts-ignore
                        const id = child.__emploriumId
                        map.delete(id)
                        child.childNodes.forEach(child => removeIDs(child as HTMLElement))
                    }
                    node?.childNodes.forEach(child => {
                        removeIDs(child as HTMLElement)
                        child.remove()
                    })
    
                    const builded =  this.buildElementNode(eventContent.content as HTMLElementSerialization);
                    builded?.childNodes.forEach(child => node?.append(child))
                    break;
                }

                case EVENTS_TYPE.SNAPSHOT: {
                    const eventContent = event.data as SnapShotEvent
                    const DOMString = eventContent.content
                    this.buildDOM(DOMString)
                    break;
                }
            }
        } catch {
            console.warn("Couldn't parse the received event !")
        }
    }

    private rebuildDOM(serialization: string | HTMLElementSerialization, dom: Document) {

        if (typeof serialization === "string") {
            serialization = JSON.parse(serialization)
        }
    
        return (this.buildElementNode(serialization as HTMLElementSerialization, dom));
    }

    private setup(){
        this.iframe = document.createElement("iframe")
        this.wrapper = document.createElement("div")
        this.wrapper.append(this.iframe)
        document.append(this.wrapper)
    }

    private serializeDOMElement(element: HTMLElement | Document): HTMLElementSerialization | undefined  {
        switch(element.nodeType) {
            case document.ELEMENT_NODE:
                element = element as HTMLElement
                //@ts-ignore
                element.__emploriumId = _this.id + 1;
                return {
                    id: ++this._id,
                    tag: element.tagName.toLocaleLowerCase(),
                    type: document.ELEMENT_NODE,
                    children: Array.from(element.childNodes).map(child => this.serializeDOMElement(child as HTMLElement)).filter(serialize => serialize !== void 0) as HTMLElementSerialization[],
                    attributes: Array.from(element.attributes).map(attribute => {
                        if (attribute.value === "" || attribute.value === null || attribute.value === void 0) {
                            return {}
                        }
                        const protocol = window.location.protocol
                        const hostname = window.location.hostname
                        const port =  window.location.port === "80" || window.location.port === "443" ? '' : ":"+window.location.port
                        let value = attribute.value
                        if ((attribute.name === "href" || attribute.name === "src") && !/^(https|http):\/\//.test(attribute.value)) {
                            value = value[0] !== "/" ? "/" + value : value;
                            value = `${protocol}//${hostname}${port}${value}`
                        } 
                        return ({[attribute.name]: value})
                    }).reduce((acc, v) => ({...acc, ...v}),{})
                }
            case document.TEXT_NODE:
                element = element as HTMLElement
                if (element.textContent === null) {
                    return undefined
                }
                //@ts-ignore
                element.__emploriumId = _id + 1;
                return {
                    id: ++this._id,
                    type: document.TEXT_NODE,
                    content: element.textContent as string,
                }
            case document.DOCUMENT_NODE:
                element = element as Document
                //@ts-ignore
                element.__emploriumId = _id + 1;
                return {
                    id: ++this._id,
                    type: document.DOCUMENT_NODE,
                    children: [element.head, element.body].map(element => this.serializeDOMElement(element)).filter(serialize => serialize !== void 0) as HTMLElementSerialization[]
                }
        }
        return undefined;
    }

    private buildElementNode (element: HTMLElementSerialization, virtualDocument?: Document): HTMLElement | Document | Text | undefined {
        switch(element.type) {
            case document.DOCUMENT_NODE: {
                //const doc = document.implementation.createDocument(null, null, null)
                const children = element.children?.map(child =>this.buildElementNode(child, virtualDocument)) || []
                const HTMLNode = document.createElement("html")
                children.map(child => HTMLNode.appendChild(child as HTMLElement))
                virtualDocument!.append(HTMLNode)
                return virtualDocument
            }
            case document.ELEMENT_NODE: {
                const node = virtualDocument?.createElement(element.tag as string) as HTMLElement
                const attributes = element.attributes as {} || {}
                const children = element.children?.map(child => this.buildElementNode(child, virtualDocument)) || []
                //@ts-ignore
                node!.__emploriumId = element.id
                //@ts-ignore
                Object.keys(attributes).map(key => node?.setAttribute(key, attributes[key]))
                children.map(child => node.appendChild(child as HTMLElement))
                //@ts-ignore
                map.set(node.__emploriumId, node)
                return node
            }
            case document.TEXT_NODE: {
                const textNode = virtualDocument?.createTextNode(element.content as string) as Text
                return textNode
             }
    
        }
        return undefined
    }
}