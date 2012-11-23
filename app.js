/*
 * Copyright 2011 Google Inc. All Rights Reserved.

 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var google = new OAuth2('google', {
  client_id: '952993494713-h12m6utvq8g8d8et8n2i68plbrr6cr4d.apps.googleusercontent.com',
  client_secret: 'IZ4hBSbosuhoWAX4lyAomm-R',
  api_scope: 'https://www.googleapis.com/auth/tasks'
});
isArray = function(obj) { return obj.constructor == Array }
isObject = function(obj) { return obj.constructor == Object }
isNumber = function(obj) { return !isNaN(parseFloat(obj)) && isFinite(obj) }
clone = function(obj) { return JSON.parse(JSON.stringify(obj)) }
ArrayDiff = function(a,b) { return a.filter(function(i) {return !(b.indexOf(i) > -1)})}

var sync = {

  moveTask: function(id, list, server) {
    Array.prototype.remove= function(){
      var what, a= arguments, L= a.length, ax;
      while(L && this.length){
        what= a[--L];
        while((ax= this.indexOf(what))!= -1){
          this.splice(ax, 1);
        }
      }
      return this;
    }
    var old = server.tasks[id].list
    // Dropping a task onto the Logbook completes it
    if(list == 'logbook' && !server.tasks[id].logged) {
      server.tasks[id].logged = 1
      console.log('Logged ' + id)
    }
    // Taking a task out of the logbook
    if(server.tasks[id].list == list && server.tasks[id].logged && list != 'logbook') {
      console.log("Unlogging task")
      server.tasks[id].logged = false;
      // Deleting a task
    } else if (list === 'trash') {
      // Remove from list
      if(server.lists.items.hasOwnProperty(old)) {
        if(!server.lists.items[old].hasOwnProperty('deleted')) {
          server.lists.items[old].order.remove(id);   
        }
      }
      // Delete
      server.tasks[id] = {deleted: 1};
      console.log('Deleted: ' + id);
    } else {
      //Remove from list
      if(server.lists.items.hasOwnProperty(old)) {
        if(!server.lists.items[old].hasOwnProperty('deleted')) {
          server.lists.items[old].order.remove(id);   
        }
      }
      //Move to other list
      server.lists.items[list].order.unshift(id);
      server.tasks[id].list = list;
      console.log('Moved: ' + id + ' to ' + list);
    }
  }

  , deleteList: function(id, time, server) {
    //Deletes tasks in a list
    for (var i = server.lists.items[id].order.length - 1; i >= 0; i--) {
      this.moveTask(server.lists.items[id].order[i], 'trash', server);
    }
    //Remove from List order
    var index = server.lists.order.indexOf(id);
    if(index > -1) {
      server.lists.order.splice(index, 1);
    }
    //Deletes List
    //server.lists.items[id] = {deleted: core.timestamp()};
    server.lists.items[id] = {deleted: time};
    // server.save();
  }

  , tasks: function(client, server){
    for(var task in client.tasks) {   
      var _this = client.tasks[task];
      // 
      // Exists on Client
      // Doesn't exist on Server
      // 
      if (!_this.hasOwnProperty('deleted') && !server.tasks.hasOwnProperty(task)) {
        console.log("Task '" + task + "' is being added to the server.")
        // Add task
        server.tasks[task] = clone(_this)
        // Add to list
        server.lists.items[_this.list].order.unshift(task)
      // 
      //  Deleted on Client
      //  Not on Server
      // 
      } else if(_this.hasOwnProperty('deleted') && !server.tasks.hasOwnProperty(task)) {
        console.log("Task '" + task + "' is new, but the client deleted it")
        server.tasks[task] = { deleted: _this.deleted }
      // 
      //  Deleted on Client
      //  Exists on Server
      // 
      } else if (_this.hasOwnProperty('deleted') && !server.tasks[task].hasOwnProperty('deleted')) {
        console.log ("Task '" + task + "' was deleted on client but not on the server")
        var deleteTask = true
        for(var key in server.tasks[task].time) {
          if (server.tasks[task].time[key] > _this.deleted) deleteTask = false
        }
        if(deleteTask) {
          // Remove from lists
          this.moveTask(task, 'trash', server)
          // Update timestamp
          server.tasks[task] = {deleted: _this.deleted}
        }
      // 
      //  Deleted on Client
      //  Deleted on Server
      // 
      } else if (_this.hasOwnProperty('deleted') && server.tasks[task].hasOwnProperty('deleted')){
        console.log("Task '" + task + "' is deleted on the server and the client")
        if (_this.deleted > server.tasks[task].deleted) server.tasks[task].deleted = _this.deleted
      // 
      //  Exists on Client
      //  Deleted on Server
      //
      } else if (!_this.hasOwnProperty('deleted') && server.tasks[task].hasOwnProperty('deleted')) {
        console.log("Task '" + task + "' was deleted on the server")
        for(var key in _this.time) {
          if(_this.time[key] > server.tasks[task].deleted) {
            server.tasks[task] = clone(_this)
            break
          }
        }
      // 
      //  Exists on Client
      //  Exists on Server
      // 
      } else {
        console.log("Task '" + task + "' exists on the server and hasn't been deleted")
        for(var key in _this) {
          // Don't loop through timestamps
          if (key !== 'time') {
            if (_this.time[key] > server.tasks[task].time[key]) {
              console.log("Key '" + key + "'  in task " + task + " has been updated by the client")
              if (key === 'list') {
                console.log("Task " + task + " has been moved to a new list")
                //console.log(task)
                this.moveTask(task, _this.list, server)
              } else {
                server.tasks[task][key] = _this[key]
              }
              // Update timestamp
              server.tasks[task].time[key] = _this.time[key]
            }
          }
        }
      }
    }
    return server;
  }

  , lists: function(client, server){
    for (var list in client.lists.items) {
      console.log("Merging list: "+list)
      var _this = client.lists.items[list]
      // 
      //  Exists on client
      //  Doesn't exist on server
      // 
      if (!_this.hasOwnProperty('deleted') && !server.lists.items.hasOwnProperty(list)) {
        console.log("Adding " + list + " to server")
        // If the list doesn't exist on the server, create it
        server.lists.items[list] = {
          name: _this.name,
          order: [],
          time: _this.time
        }
        // Update list order
        server.lists.order.push(list)
      //
      //  Deleted on Client
      //  Doesn't exist on Sever
      //
      } else if (_this.hasOwnProperty('deleted') && !server.lists.items.hasOwnProperty(list)) {
        console.log("List "+list+" Is Deleted On The Client But Doesn't Exist On The Server")
        // Copy the deleted timestamp over
        server.lists.items[list] = {deleted: _this.deleted}
      // 
      //  Deleted on Client
      //  Exists on Sever
      // 
      } else if (_this.hasOwnProperty('deleted') && !server.lists.items[list].hasOwnProperty('deleted')) {
        console.log("List " + list + " Is Deleted On The Client And But Not On The Server")
        var deleteList = true
        for(var key in server.lists.items[list].time) {
          if(server.lists.items[list].time[key] > _this.deleted) deleteList = false
        }
        if(deleteList) this.deleteList(list, _this.deleted, server)
      // 
      //  Deleted on Client
      //  Deleted on Server
      // 
      } else if (server.lists.items[list].hasOwnProperty('deleted') && _this.hasOwnProperty('deleted')) {
        console.log("List '" + list + "' is deleted on the server and the computer")
        if (_this.deleted > server.lists.items[list].deleted) server.lists.items[list].deleted = _this.deleted
      // 
      //  Exists on Client
      //  Deleted on Sever
      //
      } else if (server.lists.items[list].hasOwnProperty('deleted') && client.lists.items.hasOwnProperty(list)) {
        console.log("List " + list + " is deleted on the server and exists on the client")
        for(var key in _this.time) {
          if(_this.time[key] > server.lists.items[list].deleted) {
            server.lists.items[list] = clone(_this)
            break
          }
        }
      // 
      //  Exists on Client
      //  Exists on Sever
      //
      } else if (server.lists.items.hasOwnProperty(list)) {
        console.log("List '" + list + "' exists on server.")
        for(var key in _this.time) {
          if(key != 'order') { // Don't try and overwrite list order
            if (_this.time[key] > server.lists.items[list].time[key]) {
              msg("The key '" + key + "' in list '" + list + "' has been modified.")
              // If so, update list key and time
              server.lists.items[list][key] = _this[key]
              server.lists.items[list].time[key] = _this.time[key]
            }
          }
        }
      }
    }
    return server;
  }

  , ghostLists: function(server){
    for(var i = 0; i < server.lists.order.length; i++) {
      var _this = server.lists.order[i]
      if(!server.lists.items.hasOwnProperty(_this) || _this == 'today' || _this == 'next' || _this == 'logbook') {
        server.lists.order.splice(i, 1)
      }
    }
    return server;
  }

  , hiddenLists: function(server){
    for(var i in server.lists.items) {
      var _this = server.lists.items[i]
      if(!_this.hasOwnProperty('deleted') && i != 'today' && i != 'next' && i != 'logbook') {
        var index = server.lists.order.indexOf(i)
        if(index < 0) {
          server.lists.order.push(i)
        }
      }
    }
    return server;
  }

  , runMlo: function(setting){
    // Find diff
    var sD = ArrayDiff(setting.server.order, setting.client.order)
    var cD = ArrayDiff(setting.client.order, setting.server.order)
    // Check if only order has been changed
    var sameKeys = !sD.length && !cD.length
    // Only order has been changed
    if(sameKeys) {
      // Use newer timestamp
      if(setting.client.time > setting.server.time) {
        console.log("List order: Same keys so going with latest version - Client")
        return [setting.client.order, setting.client.time]
      } else {
        console.log("List order: Same keys so going with latest version - Server")
        return [setting.server.order, setting.server.time]
      }
    } else {
      // Crazy merging code
      console.log("List order: Merging with algorithm")
      // Remove all keys that aren't in the server
      setting.client.order = ArrayDiff(a, b)(setting.client.order, cD)
      for(var i = 0; i < sD.length; i++) {
        // Get the index of each key in the ServerDiff
        var index = setting.server.order.indexOf(sD[i])
        // Inject the key into the client
        setting.client.order.splice(index, 0, sD[i])
      }
      return [setting.client.order, setting.client.time]
    }

  }

  , runMloTask: function(client, server){
    for (var list in client.lists.items) {
      if (!server.lists.items[list].hasOwnProperty('deleted') && !client.lists.items[list].hasOwnProperty('deleted')) {
        
        settingMlo = {
          client: {
            order: client.lists.items[list].order,
            time: client.lists.items[list].time.order
          },
          server: {
            order: server.lists.items[list].order,
            time: server.lists.items[list].time.order
          }
        }

        result = this.runMlo(settingMlo)

        server.lists.items[list].order = result[0]
        server.lists.items[list].time.order = result[1]

      }
    }

  }
  , init: function(client, server){
    this.tasks(client, server);
    this.lists(client, server);
    this.ghostLists(server);
    this.hiddenLists(server);
    var settingMlo = {
      client: {
        order: client.lists.order,
        time: client.lists.time
      },
      server: {
        order: server.lists.order,
        time: server.lists.time
      }
    }
    var result = this.runMlo(settingMlo);
    server.lists.order = result[0]
    server.lists.time = result[1]
    this.runMloTask(client, server)
    return server;
  }

}
var utils = {
  bit: function() {
    return (Math.floor(Math.random() *36)).toString(36)
  }

  , part: function() {
    return this.bit() + this.bit() + this.bit() + this.bit()
  }

  , getId: function(){
    return this.part() + "-" + this.part() + "-" + this.part()
  }

  , decompress: function(){
    return  {
      a     : 'name'
      , b   : 'tasks'
      , c   : 'content'
      , d   : 'priority'
      , e   : 'date'
      , f   : 'today'
      , g   : 'showInToday'
      , h   : 'list'
      , i   : 'lists'
      , j   : 'logged'
      , k   : 'time'
      , l   : 'sync'
      , m   : 'synced'
      , n   : 'order'
      , o   : 'queue'
      , p   : 'length'
      , w   : 'scheduled'
      , x   : 'version'
      , y   : 'tags'
    }
  }

  , compress: function(){
    return {
      name          : 'a'
      , tasks       : 'b'
      , content     : 'c'
      , priority    : 'd'
      , date        : 'e'
      , today       : 'f'
      , showInToday : 'g'
      , list        : 'h'
      , lists       : 'i'
      , logged      : 'j'
      , time        : 'k'
      , sync        : 'l'
      , synced      : 'm'
      , order       : 'n'
      , queue       : 'o'
      , length      : 'p'
      , notes       : 'q'
      , items       : 'r'
      , next        : 's'
      , someday     : 't'
      , deleted     : 'u'
      , logbook     : 'v'
      , scheduled   : 'w'
      , version     : 'x'
      , tags        : 'y'
    }
  }

  , zip: function(obj, type){
    var chart = {}
      , out   = {};

    if(type == 'compress'){
      chart = this.compress();
    } else {
      chart = this.decompress();
    }

    for (var key in obj) {
      if (chart.hasOwnProperty(key)) {
        out[chart[key]] = obj[key];
        if (typeof obj[key] === 'object' && isArray(obj[key]) == false) {
          out[chart[key]] = utils.zip(out[chart[key]], type);
        }
      } else {
        out[key] = obj[key];
        if (typeof obj[key] === 'object' && isArray(obj[key]) == false) {
          out[key] = utils.zip(out[key], type);
        }
      }
    }
    return out;
  }


}

!function ($) {
  $(function(){
    
    $('#import').hide()
    
    google.authorize(function() {
  
      token = google.getAccessToken()
      function setHeader(xhr) {
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      }
      if(token) $('#import').show()
     
      var importGoogleTasks = {

        getDateUTC: function(data){
          var d = new Date(data)
          return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
        }



        , getLists: function(token, callback){
          $.ajax({
            url : "https://www.googleapis.com/tasks/v1/users/@me/lists",
            dataType : 'json',
            async: false,
            beforeSend : function setHeader(xhr) {
              xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            }
            , success : function(data) {
              var lists = {}
                , order = []
                , tasks = {}
              $('<p style="font-size: 20px; font-weight: bold;">Import lists - ' + data.items.length + '</p>').appendTo('#log')  
              for(var i =0; i < data.items.length; i++){
                
                var list = data.items[i]
                  , genListId = utils.getId()
                order.push(genListId)
                $('<p>  Import list - ' + list.title + '</p>').appendTo('#log') 
                //lists.push({
                //  id      : genListId
                //  , name  : list.title
                //  , order : []
                //  , time  : {
                //    name  : importGoogleTasks.getDateUTC(list.updated) 
                //  }
                //})
                lists[genListId] = {
                  name  : list.title
                  , order : []
                  , time  : {
                    name  : importGoogleTasks.getDateUTC(list.updated) 
                  }
                } 

                $.ajax({
                  url           : "https://www.googleapis.com/tasks/v1/lists/"+list.id+"/tasks"
                  , dataType    : 'json'
                  , async       : false
                  , beforeSend  : function setHeader(xhr) {
                    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                  }
                  , listId      : genListId
                  , success     : function(data){
                    if(data.items){
                      for(var j =0; j < data.items.length; j++){
                        
                        var genTaskId = utils.getId()
                          , task = data.items[j] 
                          , updated = importGoogleTasks.getDateUTC(task.updated)
                          , status = function(status){
                            if(status == 'needsAction'){
                              return false
                            } else {
                              return importGoogleTasks.getDateUTC(task.completed)
                            }
                          }

                        lists[this.listId].order.push(
                          genTaskId
                        )  

                        
                        tasks[genTaskId] = {
                          'content'     : task.title
                          , 'priority'  : 'none'
                          , 'date'      : updated 
                          , 'notes'     : task.notes
                          , 'logged'    : status(task.status)       // false - date utc
                          , 'list'      : this.listId
                          , 'time'      : 
                            {
                              'content'   : updated
                              ,'priority' : updated
                              ,'date'     : updated
                              ,'notes'    : updated
                              ,'list'     : updated
                              ,'logged'   : updated
                              ,'tags'     : updated
                            }
                        } 


                      }
                    }
                  }
                })

              }   

              callback({
                tasks: tasks
                , lists: {
                  order: order
                  , items: lists
                }
                , version: '1.4.7'
              })
            }
            , error: function(error){
              
            } 
          })  
          return 'GetList'
        }

      } 
      var client;
      client = new Dropbox.Client({
         key: "da4u54t1irdahco"
         , secret: "3ydqe041ogqe1zq"
         , sandbox: true
      });

      client.authDriver(new Dropbox.Drivers.Redirect({
        rememberUser: true
      }));

      client.authenticate(function(error, client) {
        if (error) {
          console.log('authenticate')
          return error;
        }
        client.getUserInfo(function(error, userInfo) {
          if (error) {
            return error;  // Something went wrong.
          }
          console.log("Hello, " + userInfo.name + "!");
        });
      })  

      
      $('#import').click(function(){
        importGoogleTasks.getLists(token, function(lists){
          if(lists){
            clientData = utils.zip(lists, 'decompress')
            client.writeFile("nitro_data.json", JSON.stringify(clientData), function(error, stat) {
              if (error) {
                return error;  // Something went wrong.
              }
              console.log("File saved");
            });
          }

            
        })
      })



    })
  })      
}(window.jQuery)


