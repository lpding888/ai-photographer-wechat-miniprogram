Component({
  properties:{
    loading:{type:Boolean,value:false},
    empty:{type:Boolean,value:false},
    emptyText:{type:String,value:''},
    errorText:{type:String,value:''},
    tips:{type:String,value:''},
    retryText:{type:String,value:'重试'},
    // 新增：骨架屏控制
    skeleton:{type:Boolean,value:false},
    // 新增：骨架屏样式变体（list|detail）
    variant:{type:String,value:'list'}
  },
  methods:{
    onRetryTap(){
      this.triggerEvent('retry');
    }
  }
})