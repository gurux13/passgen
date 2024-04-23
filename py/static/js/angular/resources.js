function resourceParams(resource) {
    const length = resource.length;
    const letters = resource.letters ? 'A' : '';
    const digits = resource.digits ? '0' : '';
    const symbols = resource.symbols ? '@' : '';
    const underscore = resource.underscore ? '_' : '';
    let allowed = letters + digits + symbols + underscore;
    if (allowed.length == 0) {
        allowed = '????';
    }
    const paramString = '|' + length + '| ' + allowed;
    return paramString;
}

(function () {
    'use strict';
  
    angular.module('resourcesApp', [])
  
    .controller('resourcesCtrl', ['$scope', '$log', '$http', 
      function($scope, $log, $http) {
        $log.log("resourcesCtrl");
        $scope.loading = true;
        $scope.resources = [];
        $scope.all_resources = [];
        $scope.search = '';
        $scope.resource_original = null;
        $scope.onResources = function(resources) {
            $scope.resources = resources;
            for (const resource of $scope.resources) {
                resource.params = resourceParams(resource);
                resource.link_url = resource.url.includes("://") ? resource.url : "https://" + resource.url;
                for (const account of resource.accounts) {
                    account.display_human_readable = account.human_readable ?? "По умолчанию";
                }
            }
            $scope.resources.sort((a, b) => a.name.localeCompare(b.name));
            $scope.all_resources = $scope.resources;

            $scope.searchResources();
            $scope.loading = false;
        }
        $http.get('/batchresources').then(function(response) {
            $scope.onResources(response.data.resources);
        });
        $scope.selectResource = function() {
            console.log(this);
            $scope.resource = this.resource;
            $scope.resource_original = structuredClone(this.resource);
            $log.log($scope.resource);
        }
        $scope.searchResources = function() {
            const search = this.search.toLowerCase();
            $log.log(search);
            if (search) {
                $scope.resources = $scope.all_resources.filter(function(resource) {
                    return resource.name.toLowerCase().includes(search) || resource.url.toLowerCase().includes(search);
                });
            } else {
                $scope.resources = $scope.all_resources;
            }
        }
        $scope.isResourceDirty = function() {
            return !angular.equals($scope.resource, $scope.resource_original);
        }
        $scope.saveResource = function() {
            $log.log("saveResource");
            $log.log($scope.resource);
            $scope.saving = true;
            $http.post('/updateresource', $scope.resource).then(function(response) {
                $log.log(response);
                $scope.saving = false;
                $scope.resource_original = $scope.resource = null;
                $scope.onResources(response.data.resources);
            });
        }
        $scope.closeResource = function() {
            $log.log("closeResource");
            $scope.resource = $scope.resource_original = null;
        }
        $scope.deleteResource = function(evt, resource) {
            evt.stopPropagation();
            const to_delete = resource ? resource : $scope.resource;

            if (window.confirm("Удалить ресурс " + to_delete.name + "?") == false) {
                return;
            }
            $log.log("deleteResource", evt, resource);
            $scope.deleting = true;
            $http.post('/deleteresource', to_delete.id).then(function(response) {
                $log.log(response);
                $scope.deleting = false;
                $scope.resource_original = $scope.resource = null;
                $scope.onResources(response.data.resources);
            });
            
        }
        document.body.onkeyup = function(e){
            if(e.keyCode == 27){
                angular.element(document.getElementById("app")).scope().$apply(s => s.resource = s.resource_original = null);
            }
        }
        document.getElementById("app").style.display = "block";

      }
    ]);
  
  }());