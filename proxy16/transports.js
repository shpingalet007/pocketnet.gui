'use strict';
const ProxyList =  require("free-proxy");
const _request = require("request");
const _axios = require("axios");
const proxy = new ProxyList();

module.exports = function (){
    const self = {};

    self.proxyServers = []
    self.proxyHosts = []
    self.disabledHost = []
    self.lastUpdate = Date.now();
    
    const listProxy = async ()=>{
        const data = await proxy.get();
        return data?.sort((a,b)=>
            +a.speed_download > +b.speed_download ? -1 : +a.speed_download < +b.speed_download ? 1 : 0
        )?.slice(0, 3) ?? [];
    }

    const requestQueue = async (host)=>{
        if((self.lastUpdate + 60*60*1000) < Date.now()){
            self.proxyServers = [];
            self.disabledHost = [];
            self.lastUpdate = Date.now();
            self.proxyServers = await listProxy();
        }
        if(self.disabledHost.some(el=>el===host)){
            return [{proxy: null}]
        }

        if(!self.proxyServers?.length){
            self.proxyServers = await listProxy();
        }

        if(self.proxyHosts.some(el=>el===host)){
            return self.proxyServers?.map(el=>({proxy: el})) ?? []
        }
        
        let queue =  Array(3).fill({proxy: null})
        if(self.proxyServers?.length) {
            queue.push(...self.proxyServers?.map(el=>({proxy: el}) ?? []))
        }
        return queue;
    }
    
    const axiosRequest =  async (method, ...args)=> {
        const url = new URL(args?.[0])
        const queues = await requestQueue(url.host);
        let error = {};
        for (const queue of queues) {
            if(queue.proxy){
                pushHost('proxy', url.host)
            }
            const axi = queue.proxy ?
                require('axios').create({
                    proxy: {
                        host: queue.proxy?.ip,
                        port: +queue.proxy?.port
                    }
                }) : _axios;
            try {
                return await axi[method]?.(...args)
            } catch (e) {
                error = e;
            }
        }
        pushHost('disable', url.host)
        throw error
    }
    
    const pushHost = (type, host)=>{
        self.proxyHosts = self.proxyHosts.filter(el=>el !== host)
        self.disabledHost = self.disabledHost.filter(el=>el !== host)
        switch (type){
            case 'proxy':
                self.proxyHosts.push(host)
                break;
            default :
                self.disabledHost.push(host)
        }
    }
    
    self.axios = {
        get : async (...args)=>{
            return await axiosRequest('get', ...args)
        },
        post: async (...args)=>{
            return await axiosRequest('post', ...args)
        },
        put: async (...args)=>{
            return await axiosRequest('put', ...args)
        },
        delete: async (...args)=>{
            return await axiosRequest('delete', ...args)
        },
        patch: async (...args)=>{
            return await axiosRequest('patch', ...args)
        }
    }
    
    self.request = async (options, callBack)=>{
        const url = new URL(options?.url)
        const queues = await requestQueue(url?.host);
        let error = "";
        for(const queue of queues){
            if(queue.proxy){
                pushHost('proxy', url?.host)
            }
            const req = queue.proxy ? require('request').defaults({ proxy: queue.proxy?.url}) : _request;
            try {
                const data = await new Promise((resolve, reject) => {
                    req(options, (...args)=>{
                        if(args[0]){
                            reject(args[0])
                        }else {
                            resolve(args)
                        }
                    })
                })
                callBack(...data)
                return;
            }catch (e){
                error = e;
            }
        }
        pushHost('disable', url?.host)
        callBack(error)
    }
    
    return self;
}